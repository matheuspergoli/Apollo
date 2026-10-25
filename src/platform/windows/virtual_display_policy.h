#pragma once

namespace VDISPLAY {
  // A requested virtual target must never silently become a physical capture.
  constexpr bool virtual_target_required(bool headless, bool client_requested, bool app_requested, bool no_active_display) {
    return headless || client_requested || app_requested || no_active_display;
  }

  constexpr bool virtual_target_usable(bool driver_ready, bool target_identified) {
    return driver_ready && target_identified;
  }
}
