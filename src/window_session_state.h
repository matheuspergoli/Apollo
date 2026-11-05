/**
 * @file src/window_session_state.h
 * @brief Bounded, single-owner state for window event processing and restoration.
 */
#pragma once

#include "window_management_policy.h"

#include <chrono>
#include <cstddef>
#include <unordered_map>
#include <vector>

namespace window_management {
  struct pending_event {
    window_identity identity;
    trigger event;
    std::chrono::steady_clock::time_point due;
  };

  // Owned exclusively by the WSM event thread. External callers must post work,
  // not access this state concurrently. No detached tasks or OS handles live here.
  class session_state {
  public:
    using clock = std::chrono::steady_clock;
    static constexpr std::size_t event_limit = 256;
    static constexpr std::size_t record_limit = 512;
    static constexpr auto coalesce_interval = std::chrono::milliseconds {50};

    bool activate(settings options, session_context context);
    bool active(std::uint64_t generation) const;
    bool enqueue(std::uint64_t generation, window_identity identity, trigger event, bool recent_remote_input, clock::time_point now);
    std::vector<pending_event> take_due(std::uint64_t generation, clock::time_point now, std::size_t limit = event_limit);
    void discard_pending(std::uint64_t generation);
    void rebase_manual(std::uint64_t generation, window_identity identity);
    void relinquish(std::uint64_t generation, window_identity identity);

    // Check capacity before submitting any OS movement. The single-owner rule
    // keeps capacity stable until its result is confirmed or abandoned.
    bool can_record(std::uint64_t generation, window_identity identity) const;
    bool record_move(move_record record);
    // Only observe settled state, never an intermediate asynchronous move.
    // Matching restore coordinates do not imply the frame is still on target.
    bool observe(std::uint64_t generation, window_identity identity, placement current, bool on_target);
    void destroyed(std::uint64_t generation, window_identity identity);
    std::vector<move_record> stop(std::uint64_t generation);

    std::size_t pending_count() const;
    std::size_t record_count() const;

  private:
    settings options_;
    session_context context_;
    std::uint64_t last_generation_ = 0;
    std::unordered_map<std::uintptr_t, pending_event> pending_;
    std::unordered_map<std::uintptr_t, move_record> records_;
  };
}  // namespace window_management
