/**
 * @file src/window_management_policy.h
 * @brief Window-only session policy. No display configuration or OS side effects.
 */
#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace window_management {
  enum class mode {
    disabled,
    smart,
    automatic
  };

  struct settings {
    bool enabled = true;
    mode policy = mode::smart;
    bool recover_existing = true;
    bool handle_new = true;
    bool restore_positions = true;
    // Explicit application identity; never infer a Desktop from its display name
    // or from the absence of a command. An unset selection authorizes nothing.
    std::string application_uuid;
  };

  struct session_context {
    std::uint64_t generation = 0;
    std::string application_uuid;
    std::string target_device_id;
    bool connected = false;
    bool virtual_target = false;
    bool capture_ready = false;
    bool interactive_desktop = false;
    bool remote_input_allowed = false;
    bool exclusive_owner = false;
  };

  // Deliberately distinct types: WINDOWPLACEMENT coordinates cannot be passed
  // directly to screen-coordinate calls such as SetWindowPos.
  struct screen_rect {
    std::int32_t left = 0;
    std::int32_t top = 0;
    std::int32_t right = 0;
    std::int32_t bottom = 0;
    bool operator==(const screen_rect &) const = default;
  };

  struct workspace_rect {
    std::int32_t left = 0;
    std::int32_t top = 0;
    std::int32_t right = 0;
    std::int32_t bottom = 0;
    bool operator==(const workspace_rect &) const = default;
  };

  struct monitor_area {
    screen_rect bounds;
    screen_rect work;
    std::uint32_t dpi = 0;
  };

  struct window_identity {
    std::uintptr_t handle = 0;
    std::uint32_t process_id = 0;
    std::uint32_t thread_id = 0;
    std::uint64_t process_created = 0;
    // Assigned by the event registry; retired on DESTROY, never reused in a
    // session. HWND/PID alone cannot identify a surviving window safely.
    std::uint64_t incarnation = 0;
    bool operator==(const window_identity &) const = default;
  };

  enum class show_state {
    normal,
    minimized,
    maximized
  };

  struct placement {
    screen_rect normal;
    show_state state = show_state::normal;
    bool operator==(const placement &) const = default;
  };

  struct window_traits {
    bool inspected = false;
    bool top_level = false;
    bool visible = false;
    bool same_session = false;
    bool same_desktop = false;
    bool interactive_user = false;
    bool cloaked = false;
    bool tool_window = false;
    bool owned = false;
    bool shell = false;
    bool protected_window = false;
    bool elevated = false;
    bool fullscreen = false;
    bool user_override = false;
  };

  enum class trigger {
    initial,
    shown,
    foreground,
    manual,
    location_changed
  };

  struct move_record {
    std::uint64_t generation = 0;
    window_identity identity;
    placement original;
    // Actual observed state after a successful move, not just requested state.
    placement applied;
    bool user_override = false;
    std::wstring origin_device_id;
  };

  bool session_allowed(const settings &options, const session_context &session);
  bool window_allowed(const window_traits &window);
  bool event_allowed(const settings &options, trigger event, bool recent_remote_input);

  std::optional<screen_rect> to_screen(workspace_rect rect, const monitor_area &monitor);
  std::optional<workspace_rect> to_workspace(screen_rect rect, const monitor_area &monitor);

  // All arguments are physical pixels in one per-monitor-aware coordinate
  // context. DPI describes the original/target display, not a scaling multiplier
  // to be applied again by the adapter after Windows has processed WM_DPICHANGED.
  std::optional<placement> plan_move(placement current, const monitor_area &source, const monitor_area &target);

  // The visible maximized frame is separate from the saved normal rectangle.
  // Preserve its per-edge offsets from the work area, scaled once for target DPI.
  std::optional<screen_rect> plan_maximized_frame(screen_rect frame, const monitor_area &source, const monitor_area &target);

  bool can_restore(const settings &options, const move_record &record, std::uint64_t generation, window_identity current_identity, placement current, bool origin_available);
}  // namespace window_management
