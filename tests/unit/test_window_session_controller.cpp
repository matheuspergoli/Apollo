#include "src/window_session_controller.h"

#include <algorithm>
#include <gtest/gtest.h>
#include <unordered_map>

namespace {
  namespace wm = window_management;
  using namespace std::chrono_literals;

  const wm::target_snapshot physical {L"physical-fixture", L"physical-source", {-1920, 0, 0, 1080}, {-1920, 0, 0, 1040}};
  const wm::target_snapshot target {L"virtual-fixture", L"virtual-source", {0, 0, 1920, 1080}, {0, 0, 1920, 1040}};

  wm::observed_window ordinary(std::uintptr_t handle = 1) {
    wm::observed_window window;
    window.identity = {handle, 42, 7, 1234, 1};
    window.traits.inspected = window.traits.top_level = window.traits.visible = true;
    window.traits.same_session = window.traits.same_desktop = window.traits.interactive_user = true;
    window.position = {{-1800, 100, -1000, 700}};
    window.origin = physical;
    window.area = {physical.bounds, physical.work, 96};
    return window;
  }

  class desktop_fixture final: public wm::window_backend {
  public:
    struct operation {
      std::uintptr_t handle;
      wm::placement desired;
      wm::target_snapshot destination;
      bool restoration;
    };

    std::unordered_map<std::uintptr_t, wm::observed_window> windows {{1, ordinary()}};
    std::vector<operation> operations;
    bool virtual_available = true;
    bool physical_available = true;
    bool fail_submit = false;
    unsigned long enumeration_error = 0;
    unsigned long inspection_error = 0;
    std::uintptr_t uninspectable = 0;
    std::string_view inspection_stage = "none";

    wm::window_inventory enumerate() override {
      wm::window_inventory inventory;
      inventory.error = enumeration_error;
      for (const auto &[handle, window] : windows) {
        inventory.handles.push_back(handle);
      }
      std::sort(inventory.handles.begin(), inventory.handles.end());
      return inventory;
    }

    wm::window_result inspect(std::uintptr_t handle, std::uint64_t incarnation) override {
      if (handle == uninspectable) {
        return {{}, inspection_error, inspection_stage};
      }
      if (!windows.contains(handle)) {
        return {{}, 1};
      }
      auto copy = windows.at(handle);
      copy.identity.incarnation = incarnation;
      return {copy, 0};
    }

    wm::target_result resolve(std::wstring_view path, bool restoration) override {
      if (!restoration && path == target.monitor_device_path && virtual_available) {
        return {target, 0};
      }
      if (restoration && path == physical.monitor_device_path && physical_available) {
        return {physical, 0};
      }
      return {{}, 1};
    }

    std::optional<wm::monitor_area> area(const wm::target_snapshot &display) override {
      return wm::monitor_area {display.bounds, display.work, 96};
    }

    wm::placement_result submit(const wm::observed_window &expected, wm::placement desired, const wm::target_snapshot &destination, bool restoration) override {
      if (fail_submit) {
        return {wm::placement_status::failed, 5};
      }
      operations.push_back({expected.identity.handle, desired, destination, restoration});
      return {wm::placement_status::submitted, 0};
    }

    void complete(std::size_t index) {
      const auto &request = operations.at(index);
      auto &window = windows.at(request.handle);
      window.position = request.desired;
      window.origin = request.destination;
      window.area = {window.origin.bounds, window.origin.work, 96};
    }
  };

  wm::settings options() {
    wm::settings result;
    result.application_uuid = "desktop-fixture";
    return result;
  }

  wm::session_context context(std::uint64_t generation = 1) {
    return {generation, "desktop-fixture", "device-fixture", true, true, true, true, true, true};
  }

  class WindowControllerTest: public testing::Test {
  protected:
    void SetUp() override {
      ASSERT_TRUE(controller.begin(options(), context(), target));
    }

    void recover() {
      ASSERT_TRUE(controller.recover(wm::trigger::initial));
      controller.tick(now, false);
      controller.tick(now + 50ms, false);
    }

    void confirm() {
      ASSERT_EQ(backend.operations.size(), 1u);
      backend.complete(0);
      controller.tick(now + 100ms, false);
      ASSERT_EQ(controller.statistics().moved, 1u);
    }

    desktop_fixture backend;
    wm::session_controller controller {backend};
    wm::session_controller::clock::time_point now {};
  };
}  // namespace

TEST_F(WindowControllerTest, CountsOnlyObservedCompletionAndRestoresOnlyConfirmedOwnedMovement) {
  recover();
  ASSERT_EQ(backend.operations.size(), 1u);
  EXPECT_EQ(controller.statistics().moved, 0u);
  EXPECT_FALSE(backend.operations.front().restoration);
  confirm();
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 150ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  EXPECT_TRUE(backend.operations.back().restoration);
  EXPECT_EQ(backend.operations.back().desired, ordinary().position);
  backend.complete(1);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().restored, 1u);
}

TEST_F(WindowControllerTest, UnconfirmedSubmissionTimesOutWithoutInventingOwnership) {
  recover();
  controller.tick(now + 600ms, false);
  EXPECT_EQ(controller.statistics().moved, 0u);
  EXPECT_EQ(controller.statistics().failed, 1u);
  EXPECT_EQ(controller.statistics().diagnostics.confirmed_total, 0u);
  controller.begin_stop(now + 600ms, now + 1s);
  controller.tick(now + 650ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, WindowsAlreadyOnTargetBeforeDiscoveryAreNotClaimedOrRestored) {
  // Another actor may reposition/show windows during display preparation, before
  // capture and WSM discovery. Their presence on target does not prove our work.
  auto &window = backend.windows.at(1);
  window.origin = target;
  window.area = {target.bounds, target.work, 96};
  window.position = {{120, 100, 920, 700}, wm::show_state::maximized};
  const auto external_position = window.position;
  recover();
  controller.event(1, wm::trigger::foreground, true, now + 100ms);
  controller.tick(now + 150ms, true);
  EXPECT_TRUE(backend.operations.empty());
  EXPECT_EQ(controller.statistics().moved, 0u);
  controller.begin_stop(now + 200ms, now + 1s);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_TRUE(backend.operations.empty());
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_EQ(window.position, external_position);
}

TEST_F(WindowControllerTest, MinimizationDuringDiscoveryPreventsDelayedMovementAndRestoration) {
  ASSERT_TRUE(controller.recover(wm::trigger::initial));
  // Discovery runs before its debounced movement. Re-read the live state instead
  // of replaying a normal-state snapshot after the user/app minimized the window.
  controller.tick(now, false);
  auto &window = backend.windows.at(1);
  window.position.state = wm::show_state::minimized;
  const auto minimized_position = window.position;
  controller.tick(now + 50ms, false);
  EXPECT_TRUE(backend.operations.empty());
  EXPECT_EQ(window.position, minimized_position);
  controller.begin_stop(now + 100ms, now + 1s);
  controller.tick(now + 100ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_TRUE(backend.operations.empty());
  EXPECT_EQ(controller.statistics().moved, 0u);
  EXPECT_EQ(controller.statistics().restored, 0u);
}

TEST_F(WindowControllerTest, StopWaitsForExistingSubmissionWithinBudgetButStartsNoNewRecovery) {
  recover();
  controller.begin_stop(now + 60ms, now + 1s);
  EXPECT_FALSE(controller.recover(wm::trigger::manual));
  controller.event(1, wm::trigger::foreground, true, now + 70ms);
  controller.tick(now + 100ms, true);
  EXPECT_EQ(backend.operations.size(), 1u);
  backend.complete(0);
  controller.tick(now + 150ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  backend.complete(1);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
}

TEST_F(WindowControllerTest, ManualChangeIsNotOverwrittenByDisconnectOrFurtherForegroundEvents) {
  recover();
  confirm();
  controller.user_move_started(1);
  backend.windows.at(1).position.normal.left += 20;
  controller.event(1, wm::trigger::foreground, true, now + 150ms);
  controller.tick(now + 250ms, true);
  controller.begin_stop(now + 250ms, now + 1s);
  controller.tick(now + 300ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, InspectionGapCannotRestoreOwnershipEvenIfTheWindowReturnsToItsConfirmedPosition) {
  recover();
  confirm();
  const auto confirmed = backend.windows.at(1).position;
  // A location notification arrived, but its new snapshot could not be read.
  // Returning to the old placement later cannot prove uninterrupted ownership.
  backend.uninspectable = 1;
  backend.inspection_error = 1237;  // ERROR_RETRY from native snapshot validation.
  backend.inspection_stage = "window_snapshot";
  controller.event(1, wm::trigger::location_changed, false, now + 150ms);
  backend.uninspectable = 0;
  controller.event(1, wm::trigger::foreground, true, now + 200ms);
  controller.tick(now + 250ms, true);
  controller.begin_stop(now + 300ms, now + 1s);
  controller.tick(now + 350ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
  EXPECT_EQ(backend.windows.at(1).position, confirmed);
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_EQ(controller.statistics().diagnostics.inspection_failures, 1u);
  EXPECT_EQ(controller.statistics().diagnostics.restoration_skips, 1u);
}

TEST_F(WindowControllerTest, ShutdownPreservesManualReturnAndDoesNotClaimAnExternallyShownWindow) {
  for (const auto final_state : {wm::show_state::normal, wm::show_state::minimized}) {
    SCOPED_TRACE(static_cast<int>(final_state));
    desktop_fixture fixture;
    fixture.windows.at(1).position.state = wm::show_state::maximized;
    fixture.windows.emplace(2, ordinary(2));
    fixture.windows.at(2).position.state = wm::show_state::minimized;
    wm::session_controller subject {fixture};
    ASSERT_TRUE(subject.begin(options(), context(), target));
    ASSERT_TRUE(subject.recover(wm::trigger::initial));
    subject.tick(now, false);
    subject.tick(now + 50ms, false);
    ASSERT_EQ(fixture.operations.size(), 1u);
    ASSERT_EQ(fixture.operations.front().handle, 1u);
    fixture.complete(0);
    subject.tick(now + 100ms, false);
    ASSERT_EQ(subject.statistics().moved, 1u);

    // An unrelated window appears on target without any WSM submission. Its
    // visibility is not evidence of movement/ownership and must not cause undo.
    auto &external = fixture.windows.at(2);
    external.origin = target;
    external.area = {target.bounds, target.work, 96};
    external.position = {{100, 100, 900, 700}, wm::show_state::maximized};
    const auto external_position = external.position;
    subject.event(2, wm::trigger::shown, false, now + 120ms);

    subject.user_move_started(1);
    auto &manual = fixture.windows.at(1);
    manual.origin = physical;
    manual.area = {physical.bounds, physical.work, 96};
    manual.position = {{-1700, 180, -1000, 680}, final_state};
    const auto manual_position = manual.position;
    subject.event(1, wm::trigger::location_changed, false, now + 150ms);
    subject.event(1, wm::trigger::foreground, true, now + 160ms);
    subject.tick(now + 220ms, true);
    subject.begin_stop(now + 250ms, now + 1s);
    subject.tick(now + 300ms, false);

    EXPECT_TRUE(subject.stopped());
    EXPECT_EQ(fixture.operations.size(), 1u);
    EXPECT_EQ(manual.position, manual_position);
    EXPECT_EQ(manual.origin.monitor_device_path, physical.monitor_device_path);
    EXPECT_EQ(external.position, external_position);
    EXPECT_EQ(external.origin.monitor_device_path, target.monitor_device_path);
    EXPECT_EQ(subject.statistics().restored, 0u);
    EXPECT_EQ(subject.statistics().failed, 0u);
    EXPECT_EQ(subject.statistics().diagnostics.restoration_skips, 1u);
    EXPECT_EQ(subject.statistics().diagnostics.last_reason, "ownership_lost");
  }
}

TEST_F(WindowControllerTest, ExplicitManualRecoveryRebasesRestorationToTheLatestUserPosition) {
  for (const auto recovered_state : {wm::show_state::normal, wm::show_state::maximized}) {
    SCOPED_TRACE(static_cast<int>(recovered_state));
    desktop_fixture fixture;
    fixture.windows.at(1).position.state = wm::show_state::maximized;
    fixture.windows.emplace(2, ordinary(2));
    fixture.windows.at(2).position.state = wm::show_state::minimized;
    const auto minimized_position = fixture.windows.at(2).position;
    wm::session_controller subject {fixture};
    ASSERT_TRUE(subject.begin(options(), context(), target));
    ASSERT_TRUE(subject.recover(wm::trigger::initial));
    subject.tick(now, false);
    subject.tick(now + 50ms, false);
    ASSERT_EQ(fixture.operations.size(), 1u);
    EXPECT_EQ(fixture.operations.front().desired.state, wm::show_state::maximized);
    fixture.complete(0);
    subject.tick(now + 100ms, false);
    ASSERT_EQ(subject.statistics().moved, 1u);

    // An inspection gap or dragging relinquishes ownership. Explicit recovery
    // must use the live normal or re-maximized state, not the initial snapshot.
    if (recovered_state == wm::show_state::normal) {
      fixture.uninspectable = 1;
      fixture.inspection_error = 1237;
      fixture.inspection_stage = "window_snapshot";
      subject.event(1, wm::trigger::location_changed, false, now + 110ms);
      fixture.uninspectable = 0;
    } else {
      subject.user_move_started(1);
    }
    auto user_position = ordinary();
    user_position.position = {{-1700, 200, -900, 800}, recovered_state};
    fixture.windows.at(1) = user_position;
    subject.event(1, wm::trigger::location_changed, false, now + 120ms);
    subject.event(1, wm::trigger::foreground, true, now + 130ms);
    subject.tick(now + 200ms, true);
    ASSERT_EQ(fixture.operations.size(), 1u);
    EXPECT_EQ(fixture.windows.at(1).position, user_position.position);

    ASSERT_TRUE(subject.recover(wm::trigger::manual));
    subject.tick(now + 250ms, false);
    subject.tick(now + 300ms, false);
    ASSERT_EQ(fixture.operations.size(), 2u);
    EXPECT_EQ(fixture.operations.back().handle, 1u);
    EXPECT_EQ(fixture.operations.back().desired.state, recovered_state);
    EXPECT_FALSE(fixture.operations.back().restoration);
    fixture.complete(1);
    subject.tick(now + 350ms, false);
    ASSERT_EQ(subject.statistics().moved, 2u);

    subject.begin_stop(now + 400ms, now + 1s);
    subject.tick(now + 450ms, false);
    ASSERT_EQ(fixture.operations.size(), 3u);
    EXPECT_EQ(fixture.operations.back().handle, 1u);
    EXPECT_TRUE(fixture.operations.back().restoration);
    EXPECT_EQ(fixture.operations.back().destination.monitor_device_path, physical.monitor_device_path);
    EXPECT_EQ(fixture.operations.back().desired, user_position.position);
    EXPECT_FALSE(subject.stopped());
    EXPECT_EQ(subject.statistics().restored, 0u);
    fixture.complete(2);
    subject.tick(now + 500ms, false);
    EXPECT_TRUE(subject.stopped());
    EXPECT_EQ(subject.statistics().restored, 1u);
    EXPECT_EQ(subject.statistics().failed, 0u);
    const auto &diagnostics = subject.statistics().diagnostics;
    ASSERT_EQ(diagnostics.confirmed_total, 3u);
    const auto &initial = diagnostics.confirmed_operations[0];
    const auto &recovered = diagnostics.confirmed_operations[1];
    const auto &restored = diagnostics.confirmed_operations[2];
    EXPECT_NE(initial.window, 0u);
    EXPECT_EQ(recovered.window, initial.window);
    EXPECT_EQ(restored.window, initial.window);
    EXPECT_FALSE(initial.restoration);
    EXPECT_FALSE(recovered.restoration);
    EXPECT_TRUE(restored.restoration);
    EXPECT_EQ(initial.before, wm::show_state::maximized);
    EXPECT_EQ(initial.requested, wm::show_state::maximized);
    EXPECT_EQ(initial.observed, wm::show_state::maximized);
    for (const auto *operation : {&recovered, &restored}) {
      EXPECT_EQ(operation->before, recovered_state);
      EXPECT_EQ(operation->requested, recovered_state);
      EXPECT_EQ(operation->observed, recovered_state);
    }
    EXPECT_EQ(fixture.windows.at(1).position, user_position.position);
    EXPECT_EQ(fixture.windows.at(1).origin.monitor_device_path, physical.monitor_device_path);
    EXPECT_EQ(fixture.windows.at(2).position, minimized_position);
    EXPECT_EQ(fixture.windows.at(2).origin.monitor_device_path, physical.monitor_device_path);
  }
}

TEST_F(WindowControllerTest, StaleWindowIdentityAndDestroyedWindowsNeverReceiveRestoration) {
  recover();
  confirm();
  ++backend.windows.at(1).identity.process_created;
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, TargetLossDoesNotSelectPhysicalFallbackAndDeadlineIsFinite) {
  recover();
  backend.virtual_available = false;
  controller.tick(now + 100ms, false);
  controller.tick(now + 150ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
  EXPECT_EQ(controller.statistics().restored, 0u);
}

TEST_F(WindowControllerTest, ShutdownDeadlineDoesNotWaitForeverForRestoration) {
  recover();
  confirm();
  controller.begin_stop(now + 150ms, now + 200ms);
  controller.tick(now + 150ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  controller.tick(now + 250ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_GT(controller.statistics().failed, 0u);
}

TEST_F(WindowControllerTest, SmartRechecksRemoteEvidenceWhenDelayedWorkIsExecuted) {
  controller.event(1, wm::trigger::foreground, true, now);
  controller.tick(now + 100ms, false);
  EXPECT_TRUE(backend.operations.empty());
  controller.event(1, wm::trigger::foreground, true, now + 150ms);
  controller.tick(now + 200ms, true);
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, MinimizedAndProtectedWindowsAreNeverSubmitted) {
  backend.windows.at(1).position.state = wm::show_state::minimized;
  backend.windows.emplace(2, ordinary(2));
  backend.windows.at(2).traits.elevated = true;
  recover();
  EXPECT_TRUE(backend.operations.empty());
}

TEST_F(WindowControllerTest, ConfirmedWindowsAlreadyOnTargetAreIdempotent) {
  recover();
  confirm();
  for (int i = 0; i < 10; ++i) {
    controller.event(1, wm::trigger::foreground, true, now + 200ms);
    controller.tick(now + 300ms, true);
  }
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, SuspensionDropsQueuedRecoveryAndOwnershipEvenWhenAdmissionReturns) {
  recover();
  confirm();
  controller.suspend();
  backend.windows.at(1) = ordinary();
  controller.event(1, wm::trigger::foreground, true, now + 150ms);
  controller.tick(now + 250ms, true);
  controller.begin_stop(now + 300ms, now + 1s);
  controller.tick(now + 350ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, ManualRecoveryAfterSuspensionCanExplicitlyRebase) {
  recover();
  confirm();
  controller.suspend();
  backend.windows.at(1) = ordinary();
  ASSERT_TRUE(controller.recover(wm::trigger::manual));
  controller.tick(now + 150ms, false);
  controller.tick(now + 250ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  backend.complete(1);
  controller.tick(now + 300ms, false);
  EXPECT_EQ(controller.statistics().moved, 2u);
}

TEST_F(WindowControllerTest, UserMoveDuringShutdownCancelsAnOutstandingRecovery) {
  recover();
  controller.begin_stop(now + 60ms, now + 1s);
  controller.user_move_started(1);
  backend.complete(0);
  controller.tick(now + 100ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().moved, 0u);
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, DeadlineDoesNotCountAnUnobservedLateRestorationAsSuccess) {
  recover();
  confirm();
  controller.begin_stop(now + 150ms, now + 200ms);
  controller.tick(now + 150ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  backend.complete(1);
  controller.tick(now + 250ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_GT(controller.statistics().failed, 0u);
}

TEST_F(WindowControllerTest, SuspensionBeforeDiscoveryPreventsAnySubmission) {
  ASSERT_TRUE(controller.recover(wm::trigger::initial));
  controller.suspend();
  controller.tick(now + 100ms, true);
  EXPECT_TRUE(backend.operations.empty());
}

TEST_F(WindowControllerTest, LocationOverrideDuringStopIsRememberedEvenIfThePositionReturns) {
  recover();
  confirm();
  const auto applied = backend.windows.at(1).position;
  controller.begin_stop(now + 150ms, now + 1s);
  backend.windows.at(1).position.normal.left += 10;
  controller.event(1, wm::trigger::location_changed, false, now + 160ms);
  backend.windows.at(1).position = applied;
  controller.event(1, wm::trigger::location_changed, false, now + 170ms);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, ForegroundObservationDetectsUserChangeEvenWithoutALocationEvent) {
  recover();
  confirm();
  backend.windows.at(1) = ordinary();
  controller.event(1, wm::trigger::foreground, true, now + 150ms);
  controller.tick(now + 250ms, true);
  EXPECT_EQ(backend.operations.size(), 1u);
  controller.begin_stop(now + 300ms, now + 1s);
  controller.tick(now + 350ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, LateCompletionDoesNotAcquireOwnershipAfterConfirmationTimeout) {
  recover();
  backend.complete(0);
  controller.tick(now + 600ms, false);
  EXPECT_EQ(controller.statistics().moved, 0u);
  EXPECT_EQ(controller.statistics().failed, 1u);
  controller.begin_stop(now + 650ms, now + 1s);
  controller.tick(now + 700ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, DisconnectCannotRestoreAfterTargetLossBeforeTheNextRegularTick) {
  recover();
  confirm();
  backend.virtual_available = false;
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, MatchingCoordinatesOnAnotherMonitorDoNotProveRestorationOwnership) {
  recover();
  confirm();
  backend.windows.at(1).origin = physical;
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, TimeoutNeverInheritsAnUnrelatedInspectionError) {
  recover();
  backend.uninspectable = 99;
  backend.inspection_error = 13;
  controller.event(99, wm::trigger::shown, true, now + 100ms);
  EXPECT_EQ(controller.statistics().failed, 0u);
  EXPECT_EQ(controller.statistics().diagnostics.inspection_failures, 1u);
  EXPECT_EQ(controller.statistics().last_error, 13ul);
  EXPECT_EQ(controller.statistics().diagnostics.last_operation, "inspect");
  controller.tick(now + 600ms, false);
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.failed, 1u);
  EXPECT_EQ(stats.diagnostics.confirmation_timeouts, 1u);
  EXPECT_EQ(stats.diagnostics.last_operation, "confirm_move");
  EXPECT_EQ(stats.diagnostics.last_reason, "confirmation_timeout");
  EXPECT_EQ(stats.last_error, 0ul);
  EXPECT_EQ(stats.moved, 0u);
}

TEST_F(WindowControllerTest, ConfirmationInspectionFailureRetainsItsOwnCodeAndStage) {
  recover();
  backend.uninspectable = 1;
  backend.inspection_error = 13;
  controller.tick(now + 100ms, false);
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.failed, 1u);
  EXPECT_EQ(stats.diagnostics.confirmation_rejections, 1u);
  EXPECT_EQ(stats.diagnostics.inspection_failures, 1u);
  EXPECT_EQ(stats.diagnostics.last_operation, "confirm_move");
  EXPECT_EQ(stats.diagnostics.last_reason, "inspection_failed");
  EXPECT_EQ(stats.last_error, 13ul);
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 200ms, false);
  EXPECT_EQ(backend.operations.size(), 1u);
  EXPECT_EQ(stats.restored, 0u);
}

TEST_F(WindowControllerTest, AdjustedPositionIsDiagnosedWithoutRelaxingOwnership) {
  recover();
  backend.complete(0);
  backend.windows.at(1).position.normal.right += 1;
  controller.tick(now + 100ms, false);
  controller.tick(now + 600ms, false);
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.moved, 0u);
  EXPECT_EQ(stats.diagnostics.confirmation_timeouts, 1u);
  EXPECT_EQ(stats.diagnostics.last_observation, "position_mismatch");
  controller.begin_stop(now + 650ms, now + 1s);
  controller.tick(now + 700ms, false);
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, SubmissionRefusalIsNotAnUnconfirmedMovement) {
  backend.fail_submit = true;
  recover();
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.skipped, 1u);
  EXPECT_EQ(stats.failed, 0u);
  EXPECT_EQ(stats.diagnostics.submission_rejections, 1u);
  EXPECT_EQ(stats.diagnostics.confirmation_timeouts, 0u);
  EXPECT_EQ(stats.diagnostics.last_operation, "move");
  EXPECT_EQ(stats.last_error, 5ul);
}

TEST_F(WindowControllerTest, RecoveryRecommendationRequiresAnAcceptedManualDiscovery) {
  recover();
  confirm();
  controller.suspend();
  EXPECT_TRUE(controller.statistics().recovery_required);
  controller.event(1, wm::trigger::foreground, true, now + 150ms);
  controller.tick(now + 250ms, true);
  EXPECT_EQ(backend.operations.size(), 1u);
  EXPECT_TRUE(controller.statistics().recovery_required);
  backend.enumeration_error = 5;
  EXPECT_FALSE(controller.recover(wm::trigger::manual));
  EXPECT_TRUE(controller.statistics().recovery_required);
  EXPECT_EQ(controller.statistics().diagnostics.enumeration_failures, 1u);
  backend.enumeration_error = 0;
  EXPECT_TRUE(controller.recover(wm::trigger::manual));
  EXPECT_FALSE(controller.statistics().recovery_required);
  EXPECT_EQ(controller.statistics().moved, 1u);
}

TEST_F(WindowControllerTest, RestorationOriginLossIsReportedWithoutSubmittingAFallback) {
  recover();
  confirm();
  backend.physical_available = false;
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 200ms, false);
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.diagnostics.restoration_skips, 1u);
  EXPECT_EQ(stats.diagnostics.last_operation, "restore");
  EXPECT_EQ(stats.diagnostics.last_reason, "origin_unavailable");
  EXPECT_EQ(stats.last_error, 1ul);
  EXPECT_EQ(backend.operations.size(), 1u);
}

TEST_F(WindowControllerTest, ShutdownDeadlineReportsPendingRestorationWithoutInventingAWin32Error) {
  recover();
  confirm();
  controller.begin_stop(now + 150ms, now + 200ms);
  controller.tick(now + 150ms, false);
  controller.tick(now + 250ms, false);
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.restored, 0u);
  EXPECT_EQ(stats.failed, 1u);
  EXPECT_EQ(stats.diagnostics.shutdown_unfinished, 1u);
  EXPECT_EQ(stats.diagnostics.last_operation, "shutdown");
  EXPECT_EQ(stats.diagnostics.last_reason, "shutdown_deadline");
  EXPECT_EQ(stats.last_error, 0ul);
}

TEST_F(WindowControllerTest, MismatchedStateAndDestinationRemainUnconfirmedAndExplainTheLastObservation) {
  for (const auto state_mismatch : {false, true}) {
    desktop_fixture fixture;
    wm::session_controller subject {fixture};
    ASSERT_TRUE(subject.begin(options(), context(), target));
    ASSERT_TRUE(subject.recover(wm::trigger::initial));
    subject.tick(now, false);
    subject.tick(now + 50ms, false);
    ASSERT_EQ(fixture.operations.size(), 1u);
    fixture.complete(0);
    if (state_mismatch) {
      fixture.windows.at(1).position.state = wm::show_state::maximized;
    } else {
      fixture.windows.at(1).origin = physical;
    }
    subject.tick(now + 100ms, false);
    subject.tick(now + 600ms, false);
    EXPECT_EQ(subject.statistics().moved, 0u);
    EXPECT_EQ(subject.statistics().diagnostics.confirmation_timeouts, 1u);
    EXPECT_EQ(subject.statistics().diagnostics.last_observation, state_mismatch ? "state_mismatch" : "destination_mismatch");
  }
}

TEST_F(WindowControllerTest, OrdinaryManualOverrideDoesNotRecommendReclaimingTheUsersWindow) {
  recover();
  confirm();
  controller.user_move_started(1);
  EXPECT_FALSE(controller.statistics().recovery_required);
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 200ms, false);
  EXPECT_EQ(backend.operations.size(), 1u);
  EXPECT_FALSE(controller.statistics().recovery_required);
}

TEST_F(WindowControllerTest, ConfirmationIdentityChangeIsNotReportedAsAnInspectionError) {
  recover();
  ++backend.windows.at(1).identity.process_created;
  controller.tick(now + 100ms, false);
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.moved, 0u);
  EXPECT_EQ(stats.diagnostics.confirmation_rejections, 1u);
  EXPECT_EQ(stats.diagnostics.inspection_failures, 0u);
  EXPECT_EQ(stats.diagnostics.last_reason, "identity_changed");
  EXPECT_EQ(stats.last_error, 0ul);
}

TEST_F(WindowControllerTest, FailedRestorationConfirmationUsesTheRestorationStage) {
  recover();
  confirm();
  controller.begin_stop(now + 150ms, now + 1s);
  controller.tick(now + 150ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  backend.uninspectable = 1;
  backend.inspection_error = 5;
  controller.tick(now + 200ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(controller.statistics().restored, 0u);
  EXPECT_EQ(controller.statistics().diagnostics.last_operation, "confirm_restore");
  EXPECT_EQ(controller.statistics().diagnostics.last_reason, "inspection_failed");
  EXPECT_EQ(controller.statistics().last_error, 5ul);
}

TEST_F(WindowControllerTest, NewGenerationDoesNotInheritDiagnosticsOrRecoveryRecommendation) {
  recover();
  confirm();
  ASSERT_EQ(controller.statistics().diagnostics.confirmed_total, 1u);
  controller.suspend();
  backend.enumeration_error = 5;
  EXPECT_FALSE(controller.recover(wm::trigger::manual));
  EXPECT_TRUE(controller.statistics().recovery_required);
  controller.begin_stop(now, now);
  controller.tick(now, false);
  ASSERT_TRUE(controller.stopped());
  ASSERT_TRUE(controller.begin(options(), context(2), target));
  const auto &stats = controller.statistics();
  EXPECT_FALSE(stats.recovery_required);
  EXPECT_EQ(stats.last_error, 0ul);
  EXPECT_EQ(stats.failed, 0u);
  EXPECT_EQ(stats.diagnostics.enumeration_failures, 0u);
  EXPECT_EQ(stats.diagnostics.last_operation, "none");
  EXPECT_EQ(stats.diagnostics.unconfirmed_operation, "none");
  EXPECT_EQ(stats.diagnostics.unconfirmed_checks, 0u);
  EXPECT_EQ(stats.diagnostics.confirmed_total, 0u);
  EXPECT_EQ(stats.diagnostics.timeouts_unobserved, 0u);
}

TEST_F(WindowControllerTest, ConfirmationHistoryIsBoundedAndDoesNotIncludeUnobservedSubmissions) {
  recover();
  EXPECT_EQ(controller.statistics().diagnostics.confirmed_total, 0u);
  confirm();
  const auto window_number = controller.statistics().diagnostics.confirmed_operations[0].window;
  for (std::size_t i = 1; i < 20; ++i) {
    const auto time = now + std::chrono::milliseconds {static_cast<int>(i) * 200};
    controller.user_move_started(1);
    backend.windows.at(1) = ordinary();
    backend.windows.at(1).position.state = i % 2 ? wm::show_state::maximized : wm::show_state::normal;
    ASSERT_TRUE(controller.recover(wm::trigger::manual));
    controller.tick(time, false);
    controller.tick(time + 50ms, false);
    ASSERT_EQ(backend.operations.size(), i + 1);
    EXPECT_EQ(controller.statistics().diagnostics.confirmed_total, i);
    backend.complete(i);
    controller.tick(time + 100ms, false);
  }
  const auto &diagnostics = controller.statistics().diagnostics;
  ASSERT_EQ(diagnostics.confirmed_total, 20u);
  EXPECT_EQ(diagnostics.confirmed_operations.size(), 16u);
  for (std::size_t sequence = 4; sequence < 20; ++sequence) {
    const auto &operation = diagnostics.confirmed_operations[sequence % 16];
    EXPECT_EQ(operation.window, window_number);
    EXPECT_FALSE(operation.restoration);
    EXPECT_EQ(operation.observed, sequence % 2 ? wm::show_state::maximized : wm::show_state::normal);
  }
  backend.uninspectable = 99;
  backend.inspection_error = 13;
  backend.inspection_stage = "normal_geometry";
  controller.event(99, wm::trigger::location_changed, false, now + 5s);
  EXPECT_EQ(diagnostics.confirmed_total, 20u);
  EXPECT_EQ(diagnostics.confirmed_operations[19 % 16].window, window_number);
}

TEST_F(WindowControllerTest, LaterInspectionNoiseCannotEraseTheUnconfirmedMovementEvidence) {
  backend.windows.at(1).position.state = wm::show_state::maximized;
  recover();
  ASSERT_EQ(backend.operations.size(), 1u);
  backend.complete(0);
  // Model a maximized window whose restored rectangle changed but whose
  // actual monitor did not. This is not a qualification of SetWindowPlacement.
  backend.windows.at(1).origin = physical;
  controller.tick(now + 100ms, false);
  controller.tick(now + 600ms, false);
  backend.uninspectable = 99;
  backend.inspection_error = 13;
  backend.inspection_stage = "normal_geometry";
  for (unsigned int i = 0; i < 2000; ++i) {
    controller.event(99, wm::trigger::location_changed, false, now + 650ms);
  }
  const auto &stats = controller.statistics();
  EXPECT_EQ(stats.diagnostics.inspection_failures, 2000u);
  EXPECT_EQ(stats.last_error, 13ul);
  EXPECT_EQ(stats.diagnostics.last_operation, "inspect");
  EXPECT_EQ(stats.diagnostics.last_stage, "normal_geometry");
  EXPECT_EQ(stats.diagnostics.unconfirmed_operation, "confirm_move");
  EXPECT_EQ(stats.diagnostics.unconfirmed_reason, "confirmation_timeout");
  EXPECT_EQ(stats.diagnostics.unconfirmed_observation, "destination_mismatch");
  EXPECT_EQ(stats.diagnostics.unconfirmed_state, "maximized");
  EXPECT_EQ(stats.diagnostics.unconfirmed_checks, 1u);
  EXPECT_EQ(stats.diagnostics.unconfirmed_error, 0ul);
  EXPECT_EQ(stats.diagnostics.timeouts_destination, 1u);
  EXPECT_EQ(stats.moved, 0u);
  controller.begin_stop(now + 700ms, now + 1s);
  controller.tick(now + 750ms, false);
  EXPECT_EQ(backend.operations.size(), 1u);
  EXPECT_EQ(stats.diagnostics.unconfirmed_observation, "destination_mismatch");
}

TEST_F(WindowControllerTest, TimeoutBeforeAnyCheckIsDifferentFromAnObservedPositionMismatch) {
  recover();
  controller.tick(now + 600ms, false);
  const auto &diagnostics = controller.statistics().diagnostics;
  EXPECT_EQ(diagnostics.timeouts_unobserved, 1u);
  EXPECT_EQ(diagnostics.unconfirmed_checks, 0u);
  EXPECT_EQ(diagnostics.unconfirmed_observation, "not_observed");
  EXPECT_EQ(diagnostics.unconfirmed_state, "normal");
  EXPECT_EQ(diagnostics.timeouts_position, 0u);
  EXPECT_EQ(diagnostics.timeouts_state, 0u);
  EXPECT_EQ(diagnostics.timeouts_destination, 0u);
}

TEST_F(WindowControllerTest, MixedTimeoutCategoriesAccountForEveryExpiredRequestOnce) {
  backend.windows.emplace(2, ordinary(2));
  backend.windows.emplace(3, ordinary(3));
  recover();
  ASSERT_EQ(backend.operations.size(), 3u);
  for (std::size_t i = 0; i < 3; ++i) {
    backend.complete(i);
    const auto handle = backend.operations.at(i).handle;
    if (handle == 1) {
      backend.windows.at(handle).position.normal.right += 1;
    } else if (handle == 2) {
      backend.windows.at(handle).position.state = wm::show_state::maximized;
    } else {
      backend.windows.at(handle).origin = physical;
    }
  }
  controller.tick(now + 100ms, false);
  controller.tick(now + 600ms, false);
  controller.tick(now + 650ms, false);
  const auto &diagnostics = controller.statistics().diagnostics;
  EXPECT_EQ(diagnostics.confirmation_timeouts, 3u);
  EXPECT_EQ(diagnostics.timeouts_position, 1u);
  EXPECT_EQ(diagnostics.timeouts_state, 1u);
  EXPECT_EQ(diagnostics.timeouts_destination, 1u);
  EXPECT_EQ(diagnostics.timeouts_unobserved, 0u);
}

TEST_F(WindowControllerTest, ConfirmationRefusalKeepsItsOwnStageAfterAnotherInspectionFailure) {
  recover();
  backend.uninspectable = 1;
  backend.inspection_error = 5;
  backend.inspection_stage = "process_access";
  controller.tick(now + 100ms, false);
  backend.uninspectable = 99;
  backend.inspection_error = 13;
  backend.inspection_stage = "normal_geometry";
  controller.event(99, wm::trigger::location_changed, false, now + 150ms);
  const auto &diagnostics = controller.statistics().diagnostics;
  EXPECT_EQ(diagnostics.last_stage, "normal_geometry");
  EXPECT_EQ(diagnostics.unconfirmed_stage, "process_access");
  EXPECT_EQ(diagnostics.unconfirmed_error, 5ul);
  EXPECT_EQ(diagnostics.unconfirmed_reason, "inspection_failed");
  EXPECT_EQ(diagnostics.confirmation_rejections, 1u);
  EXPECT_EQ(diagnostics.confirmation_timeouts, 0u);
}
