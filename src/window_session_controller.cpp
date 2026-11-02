#include "window_session_controller.h"

#include <algorithm>
#include <utility>

namespace window_management {
  session_controller::session_controller(window_backend &backend):
      backend_(backend) {}

  bool session_controller::begin(settings options, session_context context, target_snapshot target) {
    if (!stopped_ || target.monitor_device_path.empty() || !state_.activate(options, context)) {
      return false;
    }
    options_ = std::move(options);
    context_ = std::move(context);
    target_ = std::move(target);
    statistics_ = {};
    registry_.clear();
    discovery_.clear();
    requests_.clear();
    restoration_.clear();
    stopping_ = restoration_started_ = false;
    stopped_ = false;
    return true;
  }

  bool session_controller::recover(trigger reason) {
    if (stopped_ || stopping_ || (reason != trigger::initial && reason != trigger::manual) || !event_allowed(options_, reason, false)) {
      return false;
    }
    if (!discovery_.empty()) {
      return false;
    }
    const auto inventory = backend_.enumerate();
    if (inventory.error) {
      statistics_.last_error = inventory.error;
      ++statistics_.failed;
      return false;
    }
    if (inventory.truncated || inventory.handles.size() > session_state::record_limit) {
      ++statistics_.overflow;
    }
    for (std::size_t i = 0; i < std::min(inventory.handles.size(), session_state::record_limit); ++i) {
      discovery_.push_back({inventory.handles[i], reason});
    }
    return true;
  }

  bool session_controller::in_flight(std::uintptr_t handle) const {
    return std::any_of(requests_.begin(), requests_.end(), [handle](const auto &request) {
      return request.identity.handle == handle;
    });
  }

  std::optional<observed_window> session_controller::inspect(std::uintptr_t handle) {
    auto known = registry_.find(handle);
    if (known == registry_.end() && registry_.size() >= session_state::record_limit) {
      ++statistics_.overflow;
      return {};
    }
    const auto incarnation = known == registry_.end() ? ++incarnation_ : known->second.identity.incarnation;
    auto result = backend_.inspect(handle, incarnation);
    if (!result.window) {
      statistics_.last_error = result.error;
      return {};
    }
    if (known != registry_.end() && result.window->identity != known->second.identity) {
      destroyed(handle);
      result = backend_.inspect(handle, ++incarnation_);
      if (!result.window) {
        return {};
      }
      known = registry_.end();
    }
    if (known == registry_.end()) {
      if (window_allowed(result.window->traits)) {
        registry_.emplace(handle, registry_entry {result.window->identity});
      }
    } else {
      result.window->traits.user_override |= known->second.user_override;
    }
    return std::move(result.window);
  }

  void session_controller::event(std::uintptr_t handle, trigger reason, bool recent_remote_input, clock::time_point now) {
    if (stopped_ || (stopping_ && reason != trigger::location_changed) || !handle) {
      return;
    }
    auto window = inspect(handle);
    if (!window) {
      return;
    }
    if (!in_flight(handle) && state_.observe(context_.generation, window->identity, window->position)) {
      user_move_started(handle);
      window->traits.user_override = true;
    }
    if (reason == trigger::location_changed) {
      if (!in_flight(handle)) {
        const auto changed = state_.observe(context_.generation, window->identity, window->position) ||
                             std::any_of(restoration_.begin(), restoration_.end(), [&](const auto &record) {
                               return record.identity == window->identity && record.applied != window->position;
                             });
        if (changed) {
          user_move_started(handle);
        }
      }
      return;
    }
    if (reason == trigger::manual) {
      const auto entry = registry_.find(handle);
      if (entry != registry_.end() && entry->second.user_override) {
        state_.rebase_manual(context_.generation, entry->second.identity);
        entry->second.user_override = false;
        entry->second.attempts = 0;
        window->traits.user_override = false;
      }
    }
    if (window_allowed(window->traits)) {
      state_.enqueue(context_.generation, window->identity, reason, recent_remote_input, now);
    }
  }

  void session_controller::destroyed(std::uintptr_t handle) {
    const auto entry = registry_.find(handle);
    if (entry != registry_.end()) {
      state_.destroyed(context_.generation, entry->second.identity);
      registry_.erase(entry);
    }
    std::erase_if(requests_, [handle](const auto &request) {
      return request.identity.handle == handle;
    });
    std::erase_if(discovery_, [handle](const auto &item) {
      return item.handle == handle;
    });
  }

  void session_controller::user_move_started(std::uintptr_t handle) {
    const auto entry = registry_.find(handle);
    if (entry == registry_.end() || stopped_) {
      return;
    }
    entry->second.user_override = true;
    state_.relinquish(context_.generation, entry->second.identity);
    std::erase_if(requests_, [handle](const auto &request) {
      return request.identity.handle == handle;
    });
  }

  void session_controller::suspend() {
    discovery_.clear();
    requests_.clear();
    restoration_.clear();
    state_.discard_pending(context_.generation);
    for (auto &[handle, entry] : registry_) {
      entry.user_override = true;
      state_.relinquish(context_.generation, entry.identity);
    }
  }

  void session_controller::move(const pending_event &event, const target_snapshot &target, monitor_area area, clock::time_point now, bool recent_remote_input) {
    const auto handle = event.identity.handle;
    if (in_flight(handle) || !event_allowed(options_, event.event, recent_remote_input)) {
      return;
    }
    auto window = inspect(handle);
    auto entry = registry_.find(handle);
    if (window && state_.observe(context_.generation, window->identity, window->position)) {
      user_move_started(handle);
      window->traits.user_override = true;
    }
    if (!window || entry == registry_.end() || window->identity != event.identity || !window_allowed(window->traits) ||
        !state_.can_record(context_.generation, event.identity) ||
        (event.event != trigger::manual && entry->second.attempts >= 3)) {
      ++statistics_.skipped;
      return;
    }
    if (window->origin.monitor_device_path == target.monitor_device_path) {
      return;
    }
    const auto desired = plan_move(window->position, window->area, area);
    if (!desired) {
      ++statistics_.skipped;
      return;
    }
    ++entry->second.attempts;
    const auto result = backend_.submit(*window, *desired, target, false);
    if (result.status != placement_status::submitted) {
      ++statistics_.skipped;
      statistics_.last_error = result.error;
      return;
    }
    requests_.push_back({event.identity, window->position, *desired, window->origin.monitor_device_path, target.monitor_device_path, now + confirmation_timeout, false});
  }

  void session_controller::confirm(clock::time_point now) {
    const auto count = std::min(requests_.size(), batch_limit);
    for (std::size_t i = 0; i < count; ++i) {
      auto request = std::move(requests_.front());
      requests_.pop_front();
      if (now >= request.deadline) {
        ++statistics_.failed;
        continue;
      }
      const auto entry = registry_.find(request.identity.handle);
      const auto current = backend_.inspect(request.identity.handle, request.identity.incarnation);
      if (entry == registry_.end() || entry->second.user_override || !current.window || current.window->identity != request.identity ||
          !window_allowed(current.window->traits)) {
        ++statistics_.failed;
        continue;
      }
      if (current.window->position == request.desired && current.window->origin.monitor_device_path == request.destination) {
        if (request.restoration) {
          ++statistics_.restored;
        } else if (state_.record_move({context_.generation, request.identity, request.original, current.window->position, false, request.origin})) {
          ++statistics_.moved;
        } else {
          ++statistics_.failed;
        }
      } else if (now < request.deadline) {
        requests_.push_back(std::move(request));
      } else {
        ++statistics_.failed;
      }
    }
  }

  void session_controller::restore() {
    for (std::size_t count = 0; count < batch_limit && !restoration_.empty() && requests_.size() < session_state::event_limit; ++count) {
      auto record = std::move(restoration_.front());
      restoration_.pop_front();
      const auto entry = registry_.find(record.identity.handle);
      if (entry == registry_.end() || entry->second.identity != record.identity || entry->second.user_override) {
        ++statistics_.skipped;
        continue;
      }
      const auto current = backend_.inspect(record.identity.handle, record.identity.incarnation);
      const auto origin = backend_.resolve(record.origin_device_id, true);
      if (!current.window || !origin.target || !window_allowed(current.window->traits) ||
          !can_restore(options_, record, context_.generation, current.window->identity, current.window->position, true)) {
        ++statistics_.skipped;
        continue;
      }
      const auto result = backend_.submit(*current.window, record.original, *origin.target, true);
      if (result.status == placement_status::submitted) {
        requests_.push_back({record.identity, record.applied, record.original, {}, record.origin_device_id, stop_deadline_, true});
      } else {
        ++statistics_.skipped;
        statistics_.last_error = result.error;
      }
    }
  }

  void session_controller::tick(clock::time_point now, bool recent_remote_input) {
    if (stopped_) {
      return;
    }
    if (stopping_ && now >= stop_deadline_) {
      statistics_.failed += requests_.size() + restoration_.size();
      requests_.clear();
      restoration_.clear();
      state_.stop(context_.generation);
      stopped_ = true;
      return;
    }
    confirm(now);
    if (stopping_) {
      if (!restoration_started_ && requests_.empty()) {
        auto records = state_.stop(context_.generation);
        if (restore_enabled_) {
          for (auto &record : records) {
            restoration_.push_back(std::move(record));
          }
        }
        restoration_started_ = true;
      }
      if (restoration_started_) {
        restore();
        stopped_ = requests_.empty() && restoration_.empty();
      }
      return;
    }
    const auto target = backend_.resolve(target_.monitor_device_path, false);
    if (!target.target) {
      ++statistics_.failed;
      statistics_.last_error = target.error;
      begin_stop(now, now, false);
      return;
    }
    const auto area = backend_.area(*target.target);
    if (!area) {
      ++statistics_.failed;
      begin_stop(now, now, false);
      return;
    }
    target_ = *target.target;
    for (std::size_t i = 0; i < batch_limit && !discovery_.empty(); ++i) {
      auto item = discovery_.front();
      discovery_.pop_front();
      event(item.handle, item.reason, recent_remote_input, now);
    }
    if (requests_.size() < session_state::event_limit) {
      for (const auto &event : state_.take_due(context_.generation, now, std::min(batch_limit, session_state::event_limit - requests_.size()))) {
        move(event, target_, *area, now, recent_remote_input);
      }
    }
  }

  void session_controller::begin_stop(clock::time_point now, clock::time_point deadline, bool restore) {
    if (stopped_ || stopping_) {
      return;
    }
    stopping_ = true;
    restore_enabled_ = restore;
    stop_deadline_ = std::max(now, deadline);
    discovery_.clear();
    state_.discard_pending(context_.generation);
  }

  bool session_controller::stopped() const {
    return stopped_;
  }

  bool session_controller::has_work() const {
    return !stopped_ && (stopping_ || !discovery_.empty() || !requests_.empty() || state_.pending_count());
  }

  const controller_statistics &session_controller::statistics() const {
    return statistics_;
  }
}  // namespace window_management
