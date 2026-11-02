/**
 * @file src/window_backend.h
 * @brief Window/session operations shared by the native adapter and contract tests.
 */
#pragma once

#include "window_management_policy.h"

#include <optional>
#include <string_view>
#include <vector>

namespace window_management {
  struct target_snapshot {
    std::wstring monitor_device_path;
    std::wstring source_name;
    screen_rect bounds;
    screen_rect work;
  };

  struct target_result {
    std::optional<target_snapshot> target;
    unsigned long error = 0;
  };

  struct observed_window {
    window_identity identity;
    window_traits traits;
    placement position;
    target_snapshot origin;
    monitor_area area;
  };

  struct window_result {
    std::optional<observed_window> window;
    unsigned long error = 0;
  };

  struct window_inventory {
    std::vector<std::uintptr_t> handles;
    bool truncated = false;
    unsigned long error = 0;
  };

  enum class placement_status {
    submitted,
    unchanged,
    rejected,
    stale,
    failed
  };

  struct placement_result {
    placement_status status;
    unsigned long error = 0;
  };

  class window_backend {
  public:
    virtual ~window_backend() = default;
    virtual window_inventory enumerate() = 0;
    virtual window_result inspect(std::uintptr_t handle, std::uint64_t incarnation) = 0;
    virtual target_result resolve(std::wstring_view device_path, bool restoration) = 0;
    virtual std::optional<monitor_area> area(const target_snapshot &target) = 0;
    virtual placement_result submit(const observed_window &expected, placement desired, const target_snapshot &destination, bool restoration) = 0;
  };
}  // namespace window_management
