/**
 * @file src/window_session_controller.h
 * @brief Single-executor window recovery with observed asynchronous completion.
 */
#pragma once

#include "window_backend.h"
#include "window_session_state.h"

#include <array>
#include <deque>

namespace window_management {
  struct confirmed_operation {
    std::uint64_t window = 0;  // Executor-local incarnation, never a native handle.
    bool restoration = false;
    show_state before = show_state::normal;
    show_state requested = show_state::normal;
    show_state observed = show_state::normal;
  };

  // Counts describe observations/attempts, not distinct windows. Inspection and
  // refusal diagnostics do not imply that an OS movement was submitted.
  struct controller_diagnostics {
    std::uint64_t enumeration_failures = 0;
    std::uint64_t inspection_failures = 0;
    std::uint64_t submission_rejections = 0;
    std::uint64_t confirmation_timeouts = 0;
    std::uint64_t confirmation_rejections = 0;
    std::uint64_t restoration_skips = 0;
    std::uint64_t shutdown_unfinished = 0;
    std::uint64_t target_failures = 0;
    std::uint64_t timeouts_unobserved = 0;
    std::uint64_t timeouts_state = 0;
    std::uint64_t timeouts_position = 0;
    std::uint64_t timeouts_destination = 0;
    std::string last_operation = "none";
    std::string last_reason = "none";
    std::string last_observation = "none";
    std::string last_stage = "none";
    // Inspection noise must not erase the last unconfirmed operation. This is
    // bounded, per-generation evidence, without HWNDs, titles or process paths.
    std::string unconfirmed_operation = "none";
    std::string unconfirmed_reason = "none";
    std::string unconfirmed_observation = "none";
    std::string unconfirmed_state = "none";
    std::string unconfirmed_stage = "none";
    std::uint64_t unconfirmed_checks = 0;
    unsigned long unconfirmed_error = 0;
    // Keep the latest confirmations, not a growing event log. The total exposes
    // eviction and supplies sequence numbers when lifecycle summaries repeat.
    std::array<confirmed_operation, 16> confirmed_operations {};
    std::uint64_t confirmed_total = 0;
  };

  struct controller_statistics {
    std::uint64_t moved = 0;
    std::uint64_t restored = 0;
    std::uint64_t skipped = 0;
    std::uint64_t failed = 0;
    std::uint64_t overflow = 0;
    unsigned long last_error = 0;
    controller_diagnostics diagnostics;
    bool recovery_required = false;
  };

  class session_controller {
  public:
    using clock = session_state::clock;
    static constexpr std::size_t batch_limit = 8;
    static constexpr auto confirmation_timeout = std::chrono::milliseconds {400};

    explicit session_controller(window_backend &backend);
    bool begin(settings options, session_context context, target_snapshot target);
    bool recover(trigger reason);
    void event(std::uintptr_t handle, trigger reason, bool recent_remote_input, clock::time_point now);
    void destroyed(std::uintptr_t handle);
    void user_move_started(std::uintptr_t handle);
    // Admission was interrupted: queued work and ownership evidence no longer
    // justify automatic moves/restoration. Explicit manual recovery may rebase.
    void suspend();
    void tick(clock::time_point now, bool recent_remote_input);
    void begin_stop(clock::time_point now, clock::time_point deadline, bool restore = true);
    bool stopped() const;
    bool has_work() const;
    const controller_statistics &statistics() const;

  private:
    struct registry_entry {
      window_identity identity;
      bool user_override = false;
      unsigned int attempts = 0;
    };

    struct discovery {
      std::uintptr_t handle;
      trigger reason;
    };

    struct request {
      window_identity identity;
      placement original;
      placement desired;
      std::wstring origin;
      std::wstring destination;
      clock::time_point deadline;
      bool restoration = false;
      std::string_view discrepancy = "not_observed";
      std::uint64_t checks = 0;
    };

    std::optional<observed_window> inspect(std::uintptr_t handle);
    void confirm(clock::time_point now);
    void move(const pending_event &event, const target_snapshot &target, monitor_area area, clock::time_point now, bool recent_remote_input);
    void restore();
    bool in_flight(std::uintptr_t handle) const;
    void diagnose(std::string_view operation, std::string_view reason, unsigned long error = 0, std::string_view stage = "none");
    void diagnose_confirmation(const request &request, std::string_view reason, unsigned long error = 0, std::string_view stage = "none");

    window_backend &backend_;
    session_state state_;
    settings options_;
    session_context context_;
    target_snapshot target_;
    controller_statistics statistics_;
    std::unordered_map<std::uintptr_t, registry_entry> registry_;
    std::deque<discovery> discovery_;
    std::deque<request> requests_;
    std::deque<move_record> restoration_;
    std::uint64_t incarnation_ = 0;
    bool stopping_ = false;
    bool restoration_started_ = false;
    bool stopped_ = true;
    bool restore_enabled_ = true;
    clock::time_point stop_deadline_ {};
  };
}  // namespace window_management
