/**
 * @file src/platform/windows/window_target.h
 * @brief Read-only resolution of a streaming target to its current work area.
 */
#pragma once

#include "src/window_management_policy.h"

#include <optional>
#include <string>
#include <string_view>

namespace window_management::win32 {
  struct target_snapshot {
    // Persist this identity for the session, never the GDI name or HMONITOR.
    std::wstring monitor_device_path;
    std::wstring source_name;
    screen_rect bounds;
    screen_rect work;
  };

  struct target_result {
    std::optional<target_snapshot> target;
    unsigned long error = 0;
  };

  // Initial binding uses the exact source returned by Apollo's virtual-display
  // creation, not a monitor index, friendly name or the primary-display flag.
  target_result bind_target(std::wstring_view streaming_source);
  // Refresh the work area using the bound monitor device path. A disappeared or
  // cloned/ambiguous target is an error; there is no nearest/primary fallback.
  target_result refresh_target(std::wstring_view monitor_device_path);

  // Restoration origins may legitimately be cloned physical outputs sharing
  // one logical desktop. Select a deterministic member only as its identity;
  // do not turn that physical source into an authorized streaming target.
  target_result origin_for_source(std::wstring_view source);
  target_result refresh_origin(std::wstring_view monitor_device_path);
}  // namespace window_management::win32
