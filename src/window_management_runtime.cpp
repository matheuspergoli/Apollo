#include "window_runtime_state.h"

#ifdef _WIN32
  #include "platform/windows/window_worker.h"
#endif

namespace window_management {
  namespace {
    runtime_state &state() {
#ifdef _WIN32
      static runtime_state value {win32::window_worker::start};
#else
      static runtime_state value;
#endif
      return value;
    }
  }  // namespace

  std::string_view phase_name(runtime_phase phase) {
    switch (phase) {
      case runtime_phase::disabled:
        return "disabled";
      case runtime_phase::waiting:
        return "waiting";
      case runtime_phase::active:
        return "active";
      case runtime_phase::paused:
        return "paused";
      case runtime_phase::stopping:
        return "stopping";
      case runtime_phase::stopped:
        return "stopped";
      default:
        return "failed";
    }
  }

  std::uint64_t prepare(const settings &options, const std::string &application_uuid, const std::string &device_id) noexcept {
    return state().prepare(options, application_uuid, device_id);
  }

  void stream_started(std::uint64_t generation, std::uintptr_t stream, bool input_allowed) noexcept {
    state().stream_started(generation, stream, input_allowed);
  }

  void stream_stopped(std::uint64_t generation, std::uintptr_t stream) noexcept {
    state().stream_stopped(generation, stream);
  }

  void permissions_changed(std::uintptr_t stream, bool input_allowed) noexcept {
    state().permissions_changed(stream, input_allowed);
  }

  void capture_ready(std::uint64_t generation, const std::string &source_name) noexcept {
    state().capture_ready(generation, source_name);
  }

  void remote_activity(std::uint64_t generation) noexcept {
    state().remote_activity(generation);
  }

  void stop(std::uint64_t generation) noexcept {
    state().stop(generation);
  }

  bool recover_windows() noexcept {
    return state().recover_windows();
  }

  runtime_status status() noexcept {
    return state().status();
  }
}  // namespace window_management
