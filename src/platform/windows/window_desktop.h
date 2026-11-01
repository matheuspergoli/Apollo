/**
 * @file src/platform/windows/window_desktop.h
 * @brief Restricted native window inspection and asynchronous placement requests.
 */
#pragma once

#include "window_target.h"

#include <memory>
#include <vector>

namespace window_management::win32 {
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

  // Create/use/destroy on the same WSM executor thread. Establishes only that
  // thread's DPI context. Never switches desktops, changes token privileges or
  // configures displays. Cannot be opened from Session 0 or Secure Desktop.
  class window_desktop {
  public:
    static std::unique_ptr<window_desktop> open(unsigned long &error);
    ~window_desktop();
    window_desktop(const window_desktop &) = delete;
    window_desktop &operator=(const window_desktop &) = delete;

    window_inventory enumerate();
    window_result inspect(std::uintptr_t handle, std::uint64_t incarnation);
    std::optional<monitor_area> area(const target_snapshot &target);

    // A successful submission is NOT confirmation that the app moved. The
    // executor must observe completion before recording applied placement.
    // Revalidates identity, eligibility, expected position and destination.
    placement_result submit(const observed_window &expected, placement desired, const target_snapshot &destination, bool restoration = false);

  private:
    struct impl;
    explicit window_desktop(std::unique_ptr<impl> implementation);
    std::unique_ptr<impl> impl_;
  };
}  // namespace window_management::win32
