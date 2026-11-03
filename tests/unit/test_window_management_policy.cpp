#include "src/window_management_policy.h"

#include <gtest/gtest.h>
#include <limits>

namespace {
  namespace wm = window_management;

  wm::monitor_area physical {{-1920, 0, 0, 1080}, {-1920, 0, 0, 1040}, 96};
  wm::monitor_area target {{0, 0, 1920, 1080}, {0, 0, 1920, 1040}, 96};

  wm::window_traits eligible() {
    wm::window_traits window;
    window.inspected = window.top_level = window.visible = true;
    window.same_session = window.same_desktop = window.interactive_user = true;
    return window;
  }

  wm::session_context active_session() {
    return {1, "desktop-fixture", "virtual-device-fixture", true, true, true, true, true, true};
  }

  wm::move_record moved() {
    return {1, {100, 42, 7, 1234, 1}, {{-1800, 100, -1000, 700}, wm::show_state::normal}, {{120, 100, 920, 700}, wm::show_state::normal}, false, L"physical-origin-fixture"};
  }
}  // namespace

TEST(WindowManagement, SessionRequiresExplicitApplicationAndAllReadinessConditions) {
  wm::settings settings;
  auto session = active_session();
  EXPECT_FALSE(wm::session_allowed(settings, session));
  settings.application_uuid = "desktop-fixture";
  EXPECT_TRUE(wm::session_allowed(settings, session));
  for (auto member : {&wm::session_context::connected, &wm::session_context::virtual_target, &wm::session_context::capture_ready, &wm::session_context::interactive_desktop, &wm::session_context::remote_input_allowed, &wm::session_context::exclusive_owner}) {
    auto changed = session;
    changed.*member = false;
    EXPECT_FALSE(wm::session_allowed(settings, changed));
  }
  session.target_device_id.clear();
  EXPECT_FALSE(wm::session_allowed(settings, session));
  session = active_session();
  session.application_uuid = "another-app";
  EXPECT_FALSE(wm::session_allowed(settings, session));
  session = active_session();
  session.generation = 0;
  EXPECT_FALSE(wm::session_allowed(settings, session));
  settings.enabled = false;
  EXPECT_FALSE(wm::session_allowed(settings, active_session()));
  settings.enabled = true;
  settings.policy = wm::mode::disabled;
  EXPECT_FALSE(wm::session_allowed(settings, active_session()));
}

TEST(WindowManagement, ExcludesUnsafeAndUnknownWindows) {
  EXPECT_FALSE(wm::window_allowed({}));
  EXPECT_TRUE(wm::window_allowed(eligible()));
  for (auto member : {&wm::window_traits::inspected, &wm::window_traits::top_level, &wm::window_traits::visible, &wm::window_traits::same_session, &wm::window_traits::same_desktop, &wm::window_traits::interactive_user}) {
    auto window = eligible();
    window.*member = false;
    EXPECT_FALSE(wm::window_allowed(window));
  }
  for (auto member : {&wm::window_traits::cloaked, &wm::window_traits::tool_window, &wm::window_traits::owned, &wm::window_traits::shell, &wm::window_traits::protected_window, &wm::window_traits::elevated, &wm::window_traits::fullscreen, &wm::window_traits::user_override}) {
    auto window = eligible();
    window.*member = true;
    EXPECT_FALSE(wm::window_allowed(window));
  }
}

TEST(WindowManagement, SmartRequiresRemoteEvidenceExceptForInitialAndManualRecovery) {
  wm::settings settings;
  EXPECT_TRUE(wm::event_allowed(settings, wm::trigger::initial, false));
  EXPECT_TRUE(wm::event_allowed(settings, wm::trigger::manual, false));
  EXPECT_FALSE(wm::event_allowed(settings, wm::trigger::shown, false));
  EXPECT_FALSE(wm::event_allowed(settings, wm::trigger::foreground, false));
  EXPECT_TRUE(wm::event_allowed(settings, wm::trigger::shown, true));
  EXPECT_TRUE(wm::event_allowed(settings, wm::trigger::foreground, true));
  settings.handle_new = false;
  EXPECT_FALSE(wm::event_allowed(settings, wm::trigger::shown, true));
  settings.recover_existing = false;
  EXPECT_FALSE(wm::event_allowed(settings, wm::trigger::initial, true));
}

TEST(WindowManagement, AutomaticNeverMovesInResponseToLocationEvents) {
  wm::settings settings;
  settings.policy = wm::mode::automatic;
  EXPECT_TRUE(wm::event_allowed(settings, wm::trigger::shown, false));
  EXPECT_TRUE(wm::event_allowed(settings, wm::trigger::foreground, false));
  EXPECT_FALSE(wm::event_allowed(settings, wm::trigger::location_changed, true));
  settings.policy = wm::mode::disabled;
  for (auto event : {wm::trigger::initial, wm::trigger::manual, wm::trigger::shown, wm::trigger::foreground}) {
    EXPECT_FALSE(wm::event_allowed(settings, event, true));
  }
}

TEST(WindowManagement, UnknownModeNeverAuthorizesAutomaticOrManualWork) {
  wm::settings settings;
  settings.application_uuid = "desktop-fixture";
  settings.policy = static_cast<wm::mode>(999);
  EXPECT_FALSE(wm::session_allowed(settings, active_session()));
  for (auto event : {wm::trigger::initial, wm::trigger::manual, wm::trigger::shown, wm::trigger::foreground}) {
    EXPECT_FALSE(wm::event_allowed(settings, event, true));
  }
}

TEST(WindowManagement, TransferPreservesSizeRelativePositionAndMaximizedState) {
  for (auto state : {wm::show_state::normal, wm::show_state::maximized}) {
    const auto result = wm::plan_move({{-1800, 100, -1000, 700}, state}, physical, target);
    ASSERT_TRUE(result);
    EXPECT_EQ(result->normal, (wm::screen_rect {120, 100, 920, 700}));
    EXPECT_EQ(result->state, state);
    EXPECT_FALSE(wm::plan_move(*result, target, target));
  }
}

TEST(WindowManagement, MinimizedWindowsAreNotRestoredOrMovedByPlanning) {
  EXPECT_FALSE(wm::plan_move({{-1800, 100, -1000, 700}, wm::show_state::minimized}, physical, target));
}

TEST(WindowManagement, ClampsOversizeAndOffscreenWindowsToWorkArea) {
  for (auto rect : {wm::screen_rect {-3000, -200, 500, 1500}, wm::screen_rect {8000, 9000, 9000, 10000}}) {
    const auto result = wm::plan_move({rect}, physical, target);
    ASSERT_TRUE(result);
    EXPECT_GE(result->normal.left, target.work.left);
    EXPECT_GE(result->normal.top, target.work.top);
    EXPECT_LE(result->normal.right, target.work.right);
    EXPECT_LE(result->normal.bottom, target.work.bottom);
    EXPECT_FALSE(wm::plan_move(*result, target, target));
  }
}

TEST(WindowManagement, DpiScalingOccursOnceAndSupportsNegativeTargetCoordinates) {
  auto high_dpi = target;
  high_dpi.dpi = 144;
  const auto scaled = wm::plan_move({{-1800, 100, -1000, 700}}, physical, high_dpi);
  ASSERT_TRUE(scaled);
  EXPECT_EQ(scaled->normal.right - scaled->normal.left, 1200);
  EXPECT_EQ(scaled->normal.bottom - scaled->normal.top, 900);
  EXPECT_FALSE(wm::plan_move(*scaled, high_dpi, high_dpi));
  const auto negative = wm::plan_move({{100, 50, 900, 650}}, target, physical);
  ASSERT_TRUE(negative);
  EXPECT_EQ(negative->normal, (wm::screen_rect {-1820, 50, -1020, 650}));
}

TEST(WindowManagement, WorkspaceConversionHandlesTaskbarAtTopAndLeftWithoutCreep) {
  wm::monitor_area area {{-1920, -1080, 0, 0}, {-1880, -1040, 0, 0}, 144};
  const wm::workspace_rect original {-1800, -1000, -1000, -400};
  const auto screen = wm::to_screen(original, area);
  ASSERT_TRUE(screen);
  EXPECT_EQ(*screen, (wm::screen_rect {-1760, -960, -960, -360}));
  EXPECT_EQ(wm::to_workspace(*screen, area), original);
}

TEST(WindowManagement, MaximizedSourceIsNotMistakenForTargetFromRestoreCoordinatesAlone) {
  const auto result = wm::plan_move({{100, 50, 900, 650}, wm::show_state::maximized}, physical, target);
  ASSERT_TRUE(result);
  EXPECT_EQ(result->state, wm::show_state::maximized);
}

TEST(WindowManagement, PlacementRemainsBoundedAndIdempotentAcrossDpiAndWorkAreas) {
  for (std::uint32_t dpi : {96, 120, 144, 192, 240}) {
    for (int x : {-10000, -1920, -1500, -1, 0, 1920, 10000}) {
      for (int y : {-10000, 0, 40, 500, 10000}) {
        auto destination = target;
        destination.dpi = dpi;
        const auto result = wm::plan_move({{x, y, x + 2500, y + 1500}}, physical, destination);
        ASSERT_TRUE(result);
        EXPECT_GE(result->normal.left, destination.work.left);
        EXPECT_GE(result->normal.top, destination.work.top);
        EXPECT_LE(result->normal.right, destination.work.right);
        EXPECT_LE(result->normal.bottom, destination.work.bottom);
        EXPECT_GT(result->normal.right, result->normal.left);
        EXPECT_GT(result->normal.bottom, result->normal.top);
        EXPECT_FALSE(wm::plan_move(*result, destination, destination));
      }
    }
  }
}

TEST(WindowManagement, MaximizedFrameMovesIndependentlyOfItsNormalRestoreRectangle) {
  const wm::screen_rect frame {-1928, -8, 8, 1048};
  const auto moved = wm::plan_maximized_frame(frame, physical, target);
  ASSERT_TRUE(moved);
  EXPECT_EQ(*moved, (wm::screen_rect {-8, -8, 1928, 1048}));
  EXPECT_EQ(wm::plan_maximized_frame(*moved, target, physical), frame);
  EXPECT_EQ(wm::plan_maximized_frame(frame, physical, physical), frame);
  const auto normal = wm::plan_move({{-1800, 100, -1000, 700}, wm::show_state::maximized}, physical, target);
  ASSERT_TRUE(normal);
  EXPECT_NE(*moved, normal->normal);
  EXPECT_EQ(normal->state, wm::show_state::maximized);
}

TEST(WindowManagement, MaximizedFrameUsesTargetWorkAreaAndScalesOnlyFrameOffsets) {
  const wm::monitor_area source {{-1920, 0, 0, 1080}, {-1880, 40, 0, 1080}, 96};
  const wm::monitor_area destination {{0, -1440, 2560, 0}, {0, -1380, 2560, -40}, 144};
  const auto frame = wm::plan_maximized_frame({-1888, 32, 8, 1088}, source, destination);
  ASSERT_TRUE(frame);
  EXPECT_EQ(*frame, (wm::screen_rect {-12, -1392, 2572, -28}));
  EXPECT_EQ(wm::plan_maximized_frame(*frame, destination, source), (wm::screen_rect {-1888, 32, 8, 1088}));
}

TEST(WindowManagement, MaximizedFrameRejectsInvalidAreasOffMonitorFramesAndOverflow) {
  EXPECT_FALSE(wm::plan_maximized_frame({0, 0, 0, 10}, physical, target));
  EXPECT_FALSE(wm::plan_maximized_frame({100, 100, 200, 200}, physical, target));
  auto invalid = target;
  invalid.dpi = 0;
  EXPECT_FALSE(wm::plan_maximized_frame({-1928, -8, 8, 1048}, physical, invalid));
  const auto hi = std::numeric_limits<std::int32_t>::max();
  const wm::monitor_area edge {{hi - 1920, 0, hi, 1080}, {hi - 1920, 0, hi, 1040}, 96};
  EXPECT_FALSE(wm::plan_maximized_frame({-1928, -8, 8, 1048}, physical, edge));
}

TEST(WindowManagement, InvalidGeometryAndOverflowNeverProducePlacement) {
  auto bad = target;
  bad.dpi = 0;
  EXPECT_FALSE(wm::plan_move({{-1800, 100, -1000, 700}}, physical, bad));
  bad = target;
  bad.work.right = 3000;
  EXPECT_FALSE(wm::plan_move({{-1800, 100, -1000, 700}}, physical, bad));
  EXPECT_FALSE(wm::plan_move({{0, 0, 0, 10}}, physical, target));
  wm::monitor_area offset {{0, 0, 100, 100}, {10, 10, 100, 100}, 96};
  const auto max = std::numeric_limits<std::int32_t>::max();
  EXPECT_FALSE(wm::to_screen({max - 1, 0, max, 10}, offset));
}

TEST(WindowManagement, RestoreRequiresUnchangedObservedPlacementAndSameWindowIncarnation) {
  wm::settings settings;
  auto record = moved();
  EXPECT_TRUE(wm::can_restore(settings, record, 1, record.identity, record.applied, true));
  EXPECT_FALSE(wm::can_restore(settings, record, 2, record.identity, record.applied, true));
  EXPECT_FALSE(wm::can_restore(settings, record, 1, record.identity, record.applied, false));
  auto edited = record.applied;
  ++edited.normal.left;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, record.identity, edited, true));
  edited = record.applied;
  edited.state = wm::show_state::minimized;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, record.identity, edited, true));
  auto reused = record.identity;
  ++reused.incarnation;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, reused, record.applied, true));
  reused = record.identity;
  ++reused.process_created;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, reused, record.applied, true));
  record.user_override = true;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, record.identity, record.applied, true));
  record = moved();
  settings.restore_positions = false;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, record.identity, record.applied, true));
  settings.restore_positions = true;
  record.origin_device_id.clear();
  EXPECT_FALSE(wm::can_restore(settings, record, 1, record.identity, record.applied, true));
}

TEST(WindowManagement, RestoreRejectsEveryIncompleteOrReplacedWindowIdentity) {
  wm::settings settings;
  const auto record = moved();
  auto identity = record.identity;
  ++identity.handle;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, identity, record.applied, true));
  identity = record.identity;
  ++identity.process_id;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, identity, record.applied, true));
  identity = record.identity;
  ++identity.thread_id;
  EXPECT_FALSE(wm::can_restore(settings, record, 1, identity, record.applied, true));
  for (int field = 0; field < 5; ++field) {
    auto incomplete = record;
    switch (field) {
      case 0:
        incomplete.identity.handle = 0;
        break;
      case 1:
        incomplete.identity.process_id = 0;
        break;
      case 2:
        incomplete.identity.thread_id = 0;
        break;
      case 3:
        incomplete.identity.process_created = 0;
        break;
      case 4:
        incomplete.identity.incarnation = 0;
        break;
    }
    EXPECT_FALSE(wm::can_restore(settings, incomplete, 1, incomplete.identity, incomplete.applied, true));
  }
}
