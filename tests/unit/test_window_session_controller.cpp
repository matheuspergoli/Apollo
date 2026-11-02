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

    wm::window_inventory enumerate() override {
      wm::window_inventory inventory;
      for (const auto &[handle, window] : windows) {
        inventory.handles.push_back(handle);
      }
      std::sort(inventory.handles.begin(), inventory.handles.end());
      return inventory;
    }

    wm::window_result inspect(std::uintptr_t handle, std::uint64_t incarnation) override {
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
  controller.begin_stop(now + 600ms, now + 1s);
  controller.tick(now + 650ms, false);
  EXPECT_TRUE(controller.stopped());
  EXPECT_EQ(backend.operations.size(), 1u);
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

TEST_F(WindowControllerTest, ExplicitManualRecoveryRebasesRestorationToTheLatestUserPosition) {
  recover();
  confirm();
  controller.user_move_started(1);
  auto user_position = ordinary();
  user_position.position.normal.top = 200;
  backend.windows.at(1) = user_position;
  ASSERT_TRUE(controller.recover(wm::trigger::manual));
  controller.tick(now + 150ms, false);
  controller.tick(now + 200ms, false);
  ASSERT_EQ(backend.operations.size(), 2u);
  backend.complete(1);
  controller.tick(now + 250ms, false);
  controller.begin_stop(now + 300ms, now + 1s);
  controller.tick(now + 350ms, false);
  ASSERT_EQ(backend.operations.size(), 3u);
  EXPECT_EQ(backend.operations.back().desired, user_position.position);
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
