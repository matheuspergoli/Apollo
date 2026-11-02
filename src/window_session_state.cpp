#include "window_session_state.h"

#include <algorithm>
#include <utility>

namespace window_management {
  namespace {
    bool complete(window_identity identity) {
      return identity.handle && identity.process_id && identity.thread_id && identity.process_created && identity.incarnation;
    }

    int priority(trigger event) {
      switch (event) {
        case trigger::manual:
          return 4;
        case trigger::foreground:
          return 3;
        case trigger::initial:
          return 2;
        case trigger::shown:
          return 1;
        default:
          return 0;
      }
    }
  }  // namespace

  bool session_state::activate(settings options, session_context context) {
    if (context_.connected || !session_allowed(options, context) || context.generation <= last_generation_) {
      return false;
    }
    options_ = std::move(options);
    context_ = std::move(context);
    last_generation_ = context_.generation;
    pending_.clear();
    records_.clear();
    return true;
  }

  bool session_state::active(std::uint64_t generation) const {
    return generation != 0 && generation == context_.generation && context_.connected;
  }

  bool session_state::enqueue(std::uint64_t generation, window_identity identity, trigger event, bool recent_remote_input, clock::time_point now) {
    if (!active(generation) || !complete(identity) || !event_allowed(options_, event, recent_remote_input)) {
      return false;
    }
    const auto record = records_.find(identity.handle);
    if (record != records_.end() && (record->second.identity != identity || record->second.user_override)) {
      return false;
    }
    const auto existing = pending_.find(identity.handle);
    if (existing != pending_.end()) {
      if (existing->second.identity != identity) {
        return false;
      }
      if (priority(event) > priority(existing->second.event)) {
        existing->second.event = event;
      }
      // Do not postpone the first deadline on every event: noisy apps must not
      // starve their own recovery or grow an unbounded queue.
      return true;
    }
    if (pending_.size() >= event_limit) {
      return false;
    }
    pending_.emplace(identity.handle, pending_event {identity, event, now + coalesce_interval});
    return true;
  }

  std::vector<pending_event> session_state::take_due(std::uint64_t generation, clock::time_point now, std::size_t limit) {
    std::vector<pending_event> result;
    if (!active(generation)) {
      return result;
    }
    for (auto it = pending_.begin(); it != pending_.end(); ++it) {
      if (it->second.due <= now) {
        result.push_back(it->second);
      }
    }
    std::sort(result.begin(), result.end(), [](const auto &a, const auto &b) {
      return a.due == b.due ? a.identity.handle < b.identity.handle : a.due < b.due;
    });
    result.resize(std::min(result.size(), limit));
    for (const auto &event : result) {
      pending_.erase(event.identity.handle);
    }
    return result;
  }

  void session_state::discard_pending(std::uint64_t generation) {
    if (active(generation)) {
      pending_.clear();
    }
  }

  void session_state::rebase_manual(std::uint64_t generation, window_identity identity) {
    if (active(generation)) {
      destroyed(generation, identity);
    }
  }

  void session_state::relinquish(std::uint64_t generation, window_identity identity) {
    if (!active(generation)) {
      return;
    }
    const auto found = records_.find(identity.handle);
    if (found != records_.end() && found->second.identity == identity) {
      found->second.user_override = true;
    }
    const auto event = pending_.find(identity.handle);
    if (event != pending_.end() && event->second.identity == identity) {
      pending_.erase(event);
    }
  }

  bool session_state::can_record(std::uint64_t generation, window_identity identity) const {
    if (!active(generation) || !complete(identity)) {
      return false;
    }
    const auto existing = records_.find(identity.handle);
    if (existing != records_.end()) {
      return existing->second.identity == identity && !existing->second.user_override;
    }
    return records_.size() < record_limit;
  }

  bool session_state::record_move(move_record record) {
    if (!can_record(record.generation, record.identity) || record.user_override || record.original == record.applied ||
        // Ownership must still be tracked when restoration is disabled: it is
        // also how we stop fighting subsequent user/app position changes.
        !can_restore(settings {}, record, record.generation, record.identity, record.applied, true)) {
      return false;
    }
    const auto existing = records_.find(record.identity.handle);
    if (existing != records_.end()) {
      if (existing->second.applied != record.original) {
        existing->second.user_override = true;
        return false;
      }
      // Preserve the first origin, not a later virtual-to-virtual adjustment.
      existing->second.applied = record.applied;
    } else {
      records_.emplace(record.identity.handle, std::move(record));
    }
    return true;
  }

  bool session_state::observe(std::uint64_t generation, window_identity identity, placement current) {
    if (!active(generation)) {
      return false;
    }
    const auto found = records_.find(identity.handle);
    if (found != records_.end() && found->second.identity == identity && found->second.applied != current) {
      found->second.user_override = true;
      pending_.erase(identity.handle);
      return true;
    }
    return false;
  }

  void session_state::destroyed(std::uint64_t generation, window_identity identity) {
    if (!active(generation)) {
      return;
    }
    const auto pending = pending_.find(identity.handle);
    if (pending != pending_.end() && pending->second.identity == identity) {
      pending_.erase(pending);
    }
    const auto record = records_.find(identity.handle);
    if (record != records_.end() && record->second.identity == identity) {
      records_.erase(record);
    }
  }

  std::vector<move_record> session_state::stop(std::uint64_t generation) {
    std::vector<move_record> result;
    if (!active(generation)) {
      return result;
    }
    context_.connected = false;
    pending_.clear();
    result.reserve(records_.size());
    for (auto &[handle, record] : records_) {
      result.push_back(std::move(record));
    }
    records_.clear();
    return result;
  }

  std::size_t session_state::pending_count() const {
    return pending_.size();
  }

  std::size_t session_state::record_count() const {
    return records_.size();
  }
}  // namespace window_management
