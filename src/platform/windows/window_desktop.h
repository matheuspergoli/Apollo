/**
 * @file src/platform/windows/window_desktop.h
 * @brief Restricted native window inspection and asynchronous placement requests.
 */
#pragma once

#include "window_target.h"

#include <functional>
#include <memory>
#include <vector>

namespace window_management::win32 {
  using ::window_management::observed_window;
  using ::window_management::placement_result;
  using ::window_management::placement_status;
  using ::window_management::window_inventory;
  using ::window_management::window_result;

  // Create/use/destroy on the same WSM executor thread. Establishes only that
  // thread's DPI context. Never switches desktops, changes token privileges or
  // configures displays. Cannot be opened from Session 0 or Secure Desktop.
  class window_desktop final: public window_backend {
  public:
    using admission_predicate = std::function<bool(bool restoration)>;
    static std::unique_ptr<window_desktop> open(unsigned long &error, admission_predicate admission = {});
    ~window_desktop() override;
    window_desktop(const window_desktop &) = delete;
    window_desktop &operator=(const window_desktop &) = delete;

    window_inventory enumerate() override;
    bool interactive() const;
    window_result inspect(std::uintptr_t handle, std::uint64_t incarnation) override;
    target_result resolve(std::wstring_view device_path, bool restoration) override;
    std::optional<monitor_area> area(const target_snapshot &target) override;

    // A successful submission is NOT confirmation that the app moved. The
    // executor must observe completion before recording applied placement.
    // Revalidates identity, eligibility, expected position and destination.
    placement_result submit(const observed_window &expected, placement desired, const target_snapshot &destination, bool restoration = false) override;

  private:
    struct impl;
    explicit window_desktop(std::unique_ptr<impl> implementation);
    std::unique_ptr<impl> impl_;
  };
}  // namespace window_management::win32
