#pragma once

#include "window_session_controller.h"

#include <string_view>

namespace window_management {
  enum class runtime_phase {
    disabled,
    waiting,
    active,
    paused,
    stopping,
    stopped,
    failed
  };

  struct runtime_status {
    bool supported = false;
    bool manual_available = false;
    runtime_phase phase = runtime_phase::disabled;
    std::uint64_t generation = 0;
    controller_statistics statistics;
    std::string reason;
  };

  std::string_view phase_name(runtime_phase phase);
  std::uint64_t prepare(const settings &options, const std::string &application_uuid, const std::string &device_id) noexcept;
  void stream_started(std::uint64_t generation, std::uintptr_t stream, bool input_allowed) noexcept;
  void stream_stopped(std::uint64_t generation, std::uintptr_t stream) noexcept;
  void permissions_changed(std::uintptr_t stream, bool input_allowed) noexcept;
  void capture_ready(std::uint64_t generation, std::uintptr_t stream, const std::string &source_name) noexcept;
  void remote_activity(std::uint64_t generation) noexcept;
  void stop(std::uint64_t generation) noexcept;
  bool recover_windows() noexcept;
  runtime_status status() noexcept;
}  // namespace window_management
