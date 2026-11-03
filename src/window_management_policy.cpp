/**
 * @file src/window_management_policy.cpp
 * @brief Deterministic decisions shared by production window management and tests.
 */
#include "window_management_policy.h"

#include <algorithm>
#include <limits>

namespace window_management {
  namespace {
    using coordinate = std::int64_t;

    coordinate width(screen_rect rect) {
      return coordinate(rect.right) - rect.left;
    }

    coordinate height(screen_rect rect) {
      return coordinate(rect.bottom) - rect.top;
    }

    bool valid(screen_rect rect) {
      return width(rect) > 0 && height(rect) > 0;
    }

    bool valid(const monitor_area &monitor) {
      return valid(monitor.bounds) && valid(monitor.work) &&
             monitor.work.left >= monitor.bounds.left && monitor.work.top >= monitor.bounds.top &&
             monitor.work.right <= monitor.bounds.right && monitor.work.bottom <= monitor.bounds.bottom &&
             monitor.dpi >= 48 && monitor.dpi <= 960;
    }

    std::optional<screen_rect> rect_from(coordinate left, coordinate top, coordinate right, coordinate bottom) {
      constexpr auto lo = std::numeric_limits<std::int32_t>::min();
      constexpr auto hi = std::numeric_limits<std::int32_t>::max();
      for (auto value : {left, top, right, bottom}) {
        if (value < lo || value > hi) {
          return std::nullopt;
        }
      }
      screen_rect result {static_cast<std::int32_t>(left), static_cast<std::int32_t>(top), static_cast<std::int32_t>(right), static_cast<std::int32_t>(bottom)};
      return valid(result) ? std::optional {result} : std::nullopt;
    }

    coordinate scale(coordinate value, std::uint32_t from_dpi, std::uint32_t to_dpi) {
      return value * to_dpi / from_dpi;
    }
  }  // namespace

  bool session_allowed(const settings &options, const session_context &session) {
    return options.enabled && (options.policy == mode::smart || options.policy == mode::automatic) &&
           !options.application_uuid.empty() && options.application_uuid == session.application_uuid &&
           session.generation != 0 && !session.target_device_id.empty() &&
           session.connected && session.virtual_target && session.capture_ready &&
           session.interactive_desktop && session.remote_input_allowed && session.exclusive_owner;
  }

  bool window_allowed(const window_traits &window) {
    return window.inspected && window.top_level && window.visible &&
           window.same_session && window.same_desktop && window.interactive_user &&
           !window.cloaked && !window.tool_window && !window.owned && !window.shell &&
           !window.protected_window && !window.elevated && !window.fullscreen && !window.user_override;
  }

  bool event_allowed(const settings &options, trigger event, bool recent_remote_input) {
    if (!options.enabled || (options.policy != mode::smart && options.policy != mode::automatic)) {
      return false;
    }
    switch (event) {
      case trigger::initial:
        return options.recover_existing;
      case trigger::shown:
        return options.handle_new && (options.policy == mode::automatic || recent_remote_input);
      case trigger::foreground:
        return options.policy == mode::automatic || recent_remote_input;
      case trigger::manual:
        return true;
      case trigger::location_changed:
        // A location event is evidence to reconcile our record, not permission
        // to fight a user/app that moved a window away from the target.
        return false;
    }
    return false;
  }

  std::optional<screen_rect> to_screen(workspace_rect rect, const monitor_area &monitor) {
    if (!valid(monitor)) {
      return std::nullopt;
    }
    const auto x = coordinate(monitor.work.left) - monitor.bounds.left;
    const auto y = coordinate(monitor.work.top) - monitor.bounds.top;
    return rect_from(coordinate(rect.left) + x, coordinate(rect.top) + y, coordinate(rect.right) + x, coordinate(rect.bottom) + y);
  }

  std::optional<workspace_rect> to_workspace(screen_rect rect, const monitor_area &monitor) {
    if (!valid(monitor)) {
      return std::nullopt;
    }
    const auto x = coordinate(monitor.work.left) - monitor.bounds.left;
    const auto y = coordinate(monitor.work.top) - monitor.bounds.top;
    const auto result = rect_from(coordinate(rect.left) - x, coordinate(rect.top) - y, coordinate(rect.right) - x, coordinate(rect.bottom) - y);
    if (!result) {
      return std::nullopt;
    }
    return workspace_rect {result->left, result->top, result->right, result->bottom};
  }

  std::optional<placement> plan_move(placement current, const monitor_area &source, const monitor_area &target) {
    if (!valid(source) || !valid(target) || !valid(current.normal) || current.state == show_state::minimized) {
      return std::nullopt;
    }
    // Idempotence: a window fully inside the streaming work area is untouched,
    // even if an old source DPI differs from the current target DPI.
    if (source.bounds == target.bounds && current.normal.left >= target.work.left && current.normal.top >= target.work.top &&
        current.normal.right <= target.work.right && current.normal.bottom <= target.work.bottom) {
      return std::nullopt;
    }

    const auto w = std::clamp(scale(width(current.normal), source.dpi, target.dpi), coordinate(1), width(target.work));
    const auto h = std::clamp(scale(height(current.normal), source.dpi, target.dpi), coordinate(1), height(target.work));
    const auto x = std::clamp(coordinate(target.work.left) + scale(coordinate(current.normal.left) - source.work.left, source.dpi, target.dpi), coordinate(target.work.left), coordinate(target.work.right) - w);
    const auto y = std::clamp(coordinate(target.work.top) + scale(coordinate(current.normal.top) - source.work.top, source.dpi, target.dpi), coordinate(target.work.top), coordinate(target.work.bottom) - h);
    const auto rect = rect_from(x, y, x + w, y + h);
    if (!rect) {
      return std::nullopt;
    }
    return placement {*rect, current.state};
  }

  std::optional<screen_rect> plan_maximized_frame(screen_rect frame, const monitor_area &source, const monitor_area &target) {
    if (!valid(frame) || !valid(source) || !valid(target) ||
        frame.left >= source.work.right || frame.right <= source.work.left || frame.top >= source.work.bottom || frame.bottom <= source.work.top) {
      return std::nullopt;
    }
    return rect_from(
      coordinate(target.work.left) + scale(coordinate(frame.left) - source.work.left, source.dpi, target.dpi),
      coordinate(target.work.top) + scale(coordinate(frame.top) - source.work.top, source.dpi, target.dpi),
      coordinate(target.work.right) + scale(coordinate(frame.right) - source.work.right, source.dpi, target.dpi),
      coordinate(target.work.bottom) + scale(coordinate(frame.bottom) - source.work.bottom, source.dpi, target.dpi)
    );
  }

  bool can_restore(const settings &options, const move_record &record, std::uint64_t generation, window_identity current_identity, placement current, bool origin_available) {
    const auto &identity = record.identity;
    return options.restore_positions && generation != 0 && record.generation == generation &&
           identity.handle != 0 && identity.process_id != 0 && identity.thread_id != 0 &&
           identity.process_created != 0 && identity.incarnation != 0 &&
           current_identity == identity && !record.user_override &&
           current == record.applied && valid(record.original.normal) && valid(record.applied.normal) &&
           !record.origin_device_id.empty() && origin_available;
  }
}  // namespace window_management
