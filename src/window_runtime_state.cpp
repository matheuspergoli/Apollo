#include "window_runtime_state.h"

#include <limits>
#include <utility>

namespace window_management {
  struct runtime_state::activity_evidence {
    using clock = session_controller::clock;

    explicit activity_evidence(std::uint64_t value):
        generation(value) {}

    const std::uint64_t generation;
    std::atomic<clock::duration::rep> last {0};
    std::atomic<bool> admitted {false};

    bool recent(std::uint64_t requested_generation) const {
      const auto timestamp = last.load();
      const auto now = clock::now().time_since_epoch();
      return admitted.load() && requested_generation == generation && timestamp && now >= clock::duration {timestamp} &&
             now - clock::duration {timestamp} <= std::chrono::seconds {2};
    }
  };

  runtime_state::runtime_state(worker_factory factory):
      factory_(std::move(factory)) {
    snapshot_.supported = static_cast<bool>(factory_);
    snapshot_.reason = factory_ ? "not_configured" : "unsupported_platform";
  }

  bool runtime_state::retire() {
    const auto current = evidence_.exchange({});
    if (current) {
      current->admitted.store(false);
      current->last.store(0);
    }
    if (!worker_) {
      return true;
    }
    worker_->stop();
    snapshot_ = worker_->status();
    if (!worker_->finished()) {
      // Keep exactly one quarantined worker. Never launch a replacement while
      // its native calls/hooks may still exist.
      return false;
    }
    worker_.reset();
    generation_ = 0;
    return true;
  }

  void runtime_state::update_admission() {
    if (!worker_) {
      return;
    }
    const auto owns = streams_.size() == 1 && streams_.begin()->second.generation == generation_;
    const auto permitted = owns && streams_.begin()->second.input_allowed;
    worker_->admission(owns, streams_.size() == 1, permitted);
    const auto current = evidence_.load();
    if (current) {
      current->admitted.store(permitted);
      if (!permitted) {
        current->last.store(0);
      }
    }
  }

  std::uint64_t runtime_state::prepare(const settings &options, const std::string &application_uuid, const std::string &device_id) noexcept {
    try {
      std::lock_guard lock(mutex_);
      if (!factory_ || !retire()) {
        return 0;
      }
      if (!options.enabled || options.policy == mode::disabled || options.application_uuid.empty() ||
          options.application_uuid != application_uuid || device_id.empty() ||
          (options.policy != mode::smart && options.policy != mode::automatic)) {
        snapshot_ = {true, false, runtime_phase::disabled, 0, {}, "application_not_selected"};
        return 0;
      }
      if (next_generation_ == std::numeric_limits<std::uint64_t>::max()) {
        snapshot_ = {true, false, runtime_phase::failed, 0, {}, "generation_exhausted"};
        return 0;
      }
      session_context context;
      context.generation = ++next_generation_;
      context.application_uuid = application_uuid;
      context.target_device_id = device_id;
      context.virtual_target = true;
      auto activity = std::make_shared<activity_evidence>(context.generation);
      worker_ = factory_(options, context, [activity](std::uint64_t generation) {
        return activity->recent(generation);
      });
      if (!worker_) {
        snapshot_ = {true, false, runtime_phase::failed, 0, {}, "worker_start_failed"};
        return 0;
      }
      generation_ = context.generation;
      evidence_.store(std::move(activity));
      update_admission();
      return context.generation;
    } catch (...) {
      try {
        std::lock_guard lock(mutex_);
        const auto activity = evidence_.exchange({});
        if (activity) {
          activity->admitted.store(false);
        }
        if (worker_) {
          worker_->admission(false, false, false);
        }
        snapshot_ = {true, false, runtime_phase::failed, 0, {}, "worker_start_failed"};
      } catch (...) {
      }
      return 0;
    }
  }

  void runtime_state::stream_started(std::uint64_t generation, std::uintptr_t stream, bool input_allowed) noexcept {
    try {
      if (!stream) {
        return;
      }
      std::lock_guard lock(mutex_);
      streams_.insert_or_assign(stream, membership {generation, input_allowed});
      update_admission();
    } catch (...) {
      // An untracked stream cannot leave the existing worker authorized.
      try {
        std::lock_guard lock(mutex_);
        if (worker_) {
          worker_->admission(false, false, false);
        }
      } catch (...) {
      }
    }
  }

  void runtime_state::stream_stopped(std::uint64_t generation, std::uintptr_t stream) noexcept {
    try {
      std::lock_guard lock(mutex_);
      const auto member = streams_.find(stream);
      if (member == streams_.end() || member->second.generation != generation) {
        return;
      }
      const auto was_owner = streams_.size() == 1 && member->second.generation == generation_;
      streams_.erase(member);
      if (was_owner) {
        // Disconnect may restore confirmed owned moves; prior admission loss
        // already invalidated that evidence in the executor.
        retire();
      } else {
        update_admission();
      }
    } catch (...) {
    }
  }

  void runtime_state::permissions_changed(std::uintptr_t stream, bool input_allowed) noexcept {
    try {
      std::lock_guard lock(mutex_);
      const auto member = streams_.find(stream);
      if (member != streams_.end()) {
        member->second.input_allowed = input_allowed;
        update_admission();
      }
    } catch (...) {
    }
  }

  void runtime_state::capture_ready(std::uint64_t generation, const std::string &source_name) noexcept {
    try {
      std::lock_guard lock(mutex_);
      if (generation && generation == generation_ && worker_) {
        worker_->captured(source_name);
      }
    } catch (...) {
    }
  }

  void runtime_state::remote_activity(std::uint64_t generation) noexcept {
    const auto current = evidence_.load();
    if (current && generation && current->generation == generation && current->admitted.load()) {
      current->last.store(activity_evidence::clock::now().time_since_epoch().count());
    }
  }

  void runtime_state::stop(std::uint64_t generation) noexcept {
    try {
      std::lock_guard lock(mutex_);
      if (generation && generation == generation_) {
        retire();
      }
    } catch (...) {
    }
  }

  bool runtime_state::recover_windows() noexcept {
    try {
      std::lock_guard lock(mutex_);
      return worker_ && worker_->recover();
    } catch (...) {
      return false;
    }
  }

  runtime_status runtime_state::status() noexcept {
    try {
      std::lock_guard lock(mutex_);
      return worker_ ? worker_->status() : snapshot_;
    } catch (...) {
      return {};
    }
  }
}  // namespace window_management
