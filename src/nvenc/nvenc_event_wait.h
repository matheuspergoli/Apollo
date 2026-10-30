#pragma once

#ifdef _WIN32
  #include <Windows.h>

namespace nvenc {
  enum class event_wait_status {
    completed,
    timed_out,
    failed,
    unexpected
  };

  struct event_wait_result {
    event_wait_status status;
    DWORD native_status;
    DWORD error;
  };

  inline event_wait_result wait_for_completion_event(HANDLE event, DWORD timeout_ms) {
    const auto result = WaitForSingleObject(event, timeout_ms);
    // Capture only a real failure, before diagnostics can overwrite thread state.
    const auto error = result == WAIT_FAILED ? GetLastError() : ERROR_SUCCESS;
    switch (result) {
      case WAIT_OBJECT_0:
        return {event_wait_status::completed, result, error};
      case WAIT_TIMEOUT:
        return {event_wait_status::timed_out, result, error};
      case WAIT_FAILED:
        return {event_wait_status::failed, result, error};
      default:
        return {event_wait_status::unexpected, result, error};
    }
  }
}  // namespace nvenc
#endif
