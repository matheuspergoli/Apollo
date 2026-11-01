#include "src/window_session_state.h"

#include <gtest/gtest.h>

namespace {
  namespace wm = window_management;
  using namespace std::chrono_literals;

  wm::settings options() {
    wm::settings result;
    result.application_uuid = "desktop-fixture";
    return result;
  }

  wm::session_context context(std::uint64_t generation = 1) {
    return {generation, "desktop-fixture", "virtual-fixture", true, true, true, true, true, true};
  }

  wm::window_identity identity(std::uintptr_t handle = 100) {
    return {handle, 42, 7, 1234, 1};
  }

  wm::move_record moved() {
    return {1, identity(), {{-1800, 100, -1000, 700}}, {{100, 100, 900, 700}}, false, "physical-origin-fixture"};
  }
}  // namespace

TEST(WindowSessionState, StopIsIdempotentAndRejectsWorkFromOldGenerations) {
  wm::session_state state;
  const auto now = wm::session_state::clock::time_point {};
  EXPECT_FALSE(state.enqueue(1, identity(), wm::trigger::manual, true, now));
  ASSERT_TRUE(state.activate(options(), context()));
  EXPECT_FALSE(state.activate(options(), context(2)));
  EXPECT_TRUE(state.enqueue(1, identity(), wm::trigger::manual, true, now));
  EXPECT_TRUE(state.record_move(moved()));
  EXPECT_TRUE(state.stop(2).empty());
  EXPECT_TRUE(state.active(1));
  const auto records = state.stop(1);
  ASSERT_EQ(records.size(), 1u);
  EXPECT_EQ(records.front().original, moved().original);
  EXPECT_EQ(state.pending_count(), 0u);
  EXPECT_EQ(state.record_count(), 0u);
  EXPECT_TRUE(state.stop(1).empty());
  EXPECT_FALSE(state.record_move(moved()));
  EXPECT_FALSE(state.enqueue(1, identity(), wm::trigger::manual, true, now));
  EXPECT_FALSE(state.activate(options(), context()));
  ASSERT_TRUE(state.activate(options(), context(2)));
  EXPECT_TRUE(state.take_due(1, now + 1s).empty());
  EXPECT_TRUE(state.stop(1).empty());
  EXPECT_TRUE(state.active(2));
}

TEST(WindowSessionState, CoalescesBurstWithoutPostponingFirstDeadlineOrLosingForeground) {
  wm::session_state state;
  ASSERT_TRUE(state.activate(options(), context()));
  const auto now = wm::session_state::clock::time_point {};
  EXPECT_TRUE(state.enqueue(1, identity(), wm::trigger::shown, true, now));
  EXPECT_TRUE(state.enqueue(1, identity(), wm::trigger::foreground, true, now + 20ms));
  for (int i = 0; i < 1000; ++i) {
    EXPECT_TRUE(state.enqueue(1, identity(), wm::trigger::shown, true, now + 40ms));
  }
  EXPECT_EQ(state.pending_count(), 1u);
  EXPECT_TRUE(state.take_due(1, now + 49ms).empty());
  const auto events = state.take_due(1, now + 50ms);
  ASSERT_EQ(events.size(), 1u);
  EXPECT_EQ(events.front().event, wm::trigger::foreground);
  EXPECT_EQ(state.pending_count(), 0u);
}

TEST(WindowSessionState, BoundsEventQueueAndReleasesCapacityAfterProcessing) {
  wm::session_state state;
  ASSERT_TRUE(state.activate(options(), context()));
  const auto now = wm::session_state::clock::time_point {};
  for (std::size_t i = 1; i <= wm::session_state::event_limit; ++i) {
    ASSERT_TRUE(state.enqueue(1, identity(i), wm::trigger::manual, false, now));
  }
  EXPECT_FALSE(state.enqueue(1, identity(10000), wm::trigger::manual, false, now));
  EXPECT_EQ(state.pending_count(), wm::session_state::event_limit);
  EXPECT_EQ(state.take_due(1, now + 100ms).size(), wm::session_state::event_limit);
  EXPECT_TRUE(state.enqueue(1, identity(10000), wm::trigger::manual, false, now));
}

TEST(WindowSessionState, DoesNotRestoreOrFightAUserChangeEvenIfWindowReturnsToAppliedPosition) {
  wm::session_state state;
  ASSERT_TRUE(state.activate(options(), context()));
  ASSERT_TRUE(state.record_move(moved()));
  auto changed = moved().applied;
  ++changed.normal.left;
  state.observe(1, identity(), changed);
  state.observe(1, identity(), moved().applied);
  EXPECT_FALSE(state.can_record(1, identity()));
  EXPECT_FALSE(state.enqueue(1, identity(), wm::trigger::manual, true, {}));
  auto records = state.stop(1);
  ASSERT_EQ(records.size(), 1u);
  EXPECT_TRUE(records.front().user_override);
  EXPECT_FALSE(wm::can_restore(options(), records.front(), 1, identity(), moved().applied, true));
}

TEST(WindowSessionState, DestroyRetiresIdentityAndStaleDestroyCannotRemoveItsReplacement) {
  wm::session_state state;
  ASSERT_TRUE(state.activate(options(), context()));
  ASSERT_TRUE(state.record_move(moved()));
  ASSERT_TRUE(state.enqueue(1, identity(), wm::trigger::manual, true, {}));
  auto replacement = identity();
  ++replacement.incarnation;
  EXPECT_FALSE(state.enqueue(1, replacement, wm::trigger::manual, true, {}));
  state.destroyed(1, identity());
  EXPECT_EQ(state.pending_count(), 0u);
  EXPECT_EQ(state.record_count(), 0u);
  EXPECT_TRUE(state.enqueue(1, replacement, wm::trigger::manual, true, {}));
  state.destroyed(1, identity());
  EXPECT_EQ(state.pending_count(), 1u);
}

TEST(WindowSessionState, RepeatedMovesPreserveFirstOriginAndRejectUnownedIntermediateChange) {
  wm::session_state state;
  ASSERT_TRUE(state.activate(options(), context()));
  ASSERT_TRUE(state.record_move(moved()));
  auto next = moved();
  next.original = next.applied;
  ++next.applied.normal.left;
  EXPECT_TRUE(state.record_move(next));
  const auto records = state.stop(1);
  ASSERT_EQ(records.size(), 1u);
  EXPECT_EQ(records.front().original, moved().original);
  EXPECT_EQ(records.front().applied, next.applied);

  ASSERT_TRUE(state.activate(options(), context(2)));
  auto record = moved();
  record.generation = 2;
  ASSERT_TRUE(state.record_move(record));
  auto unowned = record;
  ++unowned.original.normal.left;
  EXPECT_FALSE(state.record_move(unowned));
  const auto abandoned = state.stop(2);
  ASSERT_EQ(abandoned.size(), 1u);
  EXPECT_TRUE(abandoned.front().user_override);
}

TEST(WindowSessionState, RecordCapacityIsCheckedBeforeAnyNewMovement) {
  wm::session_state state;
  ASSERT_TRUE(state.activate(options(), context()));
  for (std::size_t i = 1; i <= wm::session_state::record_limit; ++i) {
    auto record = moved();
    record.identity = identity(i);
    ASSERT_TRUE(state.can_record(1, record.identity));
    ASSERT_TRUE(state.record_move(record));
  }
  EXPECT_FALSE(state.can_record(1, identity(10000)));
  auto record = moved();
  record.identity = identity(10000);
  EXPECT_FALSE(state.record_move(record));
  EXPECT_EQ(state.record_count(), wm::session_state::record_limit);
}

TEST(WindowSessionState, DisabledRestorationDoesNotDisableOwnershipAndUserOverrideTracking) {
  wm::session_state state;
  auto settings = options();
  settings.restore_positions = false;
  ASSERT_TRUE(state.activate(settings, context()));
  ASSERT_TRUE(state.record_move(moved()));
  auto changed = moved().applied;
  changed.state = wm::show_state::minimized;
  state.observe(1, identity(), changed);
  const auto records = state.stop(1);
  ASSERT_EQ(records.size(), 1u);
  EXPECT_TRUE(records.front().user_override);
  EXPECT_FALSE(wm::can_restore(settings, records.front(), 1, identity(), changed, true));
}
