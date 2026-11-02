#include "src/window_runtime_state.h"

#include <gtest/gtest.h>
#include <stdexcept>

namespace {
  namespace wm = window_management;

  class executor_fixture final: public wm::runtime_worker {
  public:
    void admission(bool owns_stream, bool exclusive, bool input_allowed) override {
      admitted = owns_stream && exclusive && input_allowed;
      ++admission_calls;
    }

    void captured(const std::string &source) override {
      captures.push_back(source);
    }

    bool recover() override {
      ++recover_calls;
      return admitted;
    }

    bool stop() override {
      ++stop_calls;
      admitted = false;
      done = !stall_stop;
      return done;
    }

    bool finished() const override {
      return done;
    }

    wm::runtime_status status() const override {
      return {true, admitted, done ? wm::runtime_phase::stopped : wm::runtime_phase::waiting, generation, {}, {}};
    }

    wm::activity_reader activity;
    std::uint64_t generation = 0;
    std::vector<std::string> captures;
    int stop_calls = 0;
    int admission_calls = 0;
    int recover_calls = 0;
    bool admitted = false;
    bool stall_stop = false;
    bool done = false;
  };

  class WindowRuntimeTest: public testing::Test {
  protected:
    std::uint64_t prepare() {
      wm::settings options;
      options.application_uuid = "desktop-fixture";
      return runtime.prepare(options, "desktop-fixture", "virtual-fixture");
    }

    std::vector<std::shared_ptr<executor_fixture>> workers;
    wm::runtime_state runtime {[this](wm::settings, wm::session_context context, wm::activity_reader activity) {
      auto worker = std::make_shared<executor_fixture>();
      worker->generation = context.generation;
      worker->activity = std::move(activity);
      workers.push_back(worker);
      return worker;
    }};
  };
}  // namespace

TEST_F(WindowRuntimeTest, UnselectedApplicationAndMissingTargetNeverStartAnExecutor) {
  wm::settings options;
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  options.application_uuid = "other-fixture";
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  options.application_uuid = "desktop-fixture";
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", ""), 0u);
  options.policy = wm::mode::disabled;
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  options.policy = static_cast<wm::mode>(-1);
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  EXPECT_TRUE(workers.empty());
}

TEST_F(WindowRuntimeTest, RequiresExactlyOneMatchingStreamWithInputPermission) {
  const auto generation = prepare();
  ASSERT_NE(generation, 0u);
  const auto worker = workers.back();
  EXPECT_FALSE(worker->admitted);
  runtime.stream_started(generation, 11, false);
  EXPECT_FALSE(worker->admitted);
  runtime.permissions_changed(11, true);
  EXPECT_TRUE(worker->admitted);
  // A second stream includes input-only/unselected sessions with generation 0.
  runtime.stream_started(0, 22, true);
  EXPECT_FALSE(worker->admitted);
  runtime.stream_stopped(0, 22);
  EXPECT_TRUE(worker->admitted);
  runtime.permissions_changed(11, false);
  EXPECT_FALSE(worker->admitted);
}

TEST_F(WindowRuntimeTest, StaleCaptureStopAndDisconnectCannotAffectANewerGeneration) {
  const auto old_generation = prepare();
  const auto old_worker = workers.back();
  runtime.stop(old_generation);
  const auto generation = prepare();
  ASSERT_GT(generation, old_generation);
  const auto worker = workers.back();
  EXPECT_EQ(old_worker->stop_calls, 1);
  runtime.stream_started(generation, 11, true);
  worker->captures.clear();
  runtime.capture_ready(old_generation, 11, "stale-source");
  runtime.stop(old_generation);
  runtime.stream_stopped(old_generation, 11);
  EXPECT_TRUE(worker->admitted);
  EXPECT_TRUE(worker->captures.empty());
  EXPECT_EQ(worker->stop_calls, 0);
  runtime.capture_ready(generation, 11, "actual-source");
  ASSERT_EQ(worker->captures.size(), 1u);
  EXPECT_EQ(worker->captures.front(), "actual-source");
}

TEST_F(WindowRuntimeTest, CaptureIdentityBelongsToTheSurvivingStreamNotTheLastCallback) {
  const auto generation = prepare();
  const auto worker = workers.back();
  runtime.stream_started(generation, 11, true);
  runtime.capture_ready(generation, 11, "first-source");
  runtime.stream_started(generation, 22, true);
  runtime.capture_ready(generation, 22, "second-source");
  runtime.capture_ready(generation, 11, {});
  EXPECT_FALSE(worker->admitted);
  runtime.stream_stopped(generation, 11);
  EXPECT_TRUE(worker->admitted);
  ASSERT_FALSE(worker->captures.empty());
  EXPECT_EQ(worker->captures.back(), "second-source");
  runtime.capture_ready(generation, 11, "late-first-source");
  EXPECT_EQ(worker->captures.back(), "second-source");
}

TEST_F(WindowRuntimeTest, RetirementRefusesReplacementUntilTheTimedOutWorkerActuallyFinishes) {
  const auto generation = prepare();
  const auto worker = workers.back();
  worker->stall_stop = true;
  runtime.stop(generation);
  EXPECT_EQ(prepare(), 0u);
  EXPECT_EQ(workers.size(), 1u);
  worker->stall_stop = false;
  EXPECT_GT(prepare(), generation);
  EXPECT_EQ(workers.size(), 2u);
}

TEST_F(WindowRuntimeTest, OwnerDisconnectRetiresBeforeAnyFutureSessionCanBeAdmitted) {
  const auto generation = prepare();
  const auto worker = workers.back();
  runtime.stream_started(generation, 11, true);
  runtime.stream_stopped(generation, 11);
  EXPECT_EQ(worker->stop_calls, 1);
  EXPECT_TRUE(worker->finished());
  EXPECT_FALSE(runtime.recover_windows());
  EXPECT_EQ(runtime.status().phase, wm::runtime_phase::stopped);
  runtime.stream_stopped(generation, 11);
  EXPECT_EQ(worker->stop_calls, 1);
}

TEST_F(WindowRuntimeTest, InputEvidenceRequiresAdmissionAndIsNotInheritedAcrossGenerations) {
  const auto old_generation = prepare();
  const auto old_worker = workers.back();
  runtime.remote_activity(old_generation);
  EXPECT_FALSE(old_worker->activity(old_generation));
  runtime.stream_started(old_generation, 11, true);
  runtime.remote_activity(old_generation);
  EXPECT_TRUE(old_worker->activity(old_generation));
  runtime.permissions_changed(11, false);
  runtime.remote_activity(old_generation);
  EXPECT_FALSE(old_worker->activity(old_generation));
  runtime.stream_stopped(old_generation, 11);
  const auto generation = prepare();
  const auto worker = workers.back();
  runtime.stream_started(generation, 22, true);
  runtime.remote_activity(old_generation);
  EXPECT_FALSE(worker->activity(generation));
  runtime.remote_activity(generation);
  EXPECT_TRUE(worker->activity(generation));
  EXPECT_FALSE(old_worker->activity(old_generation));
  EXPECT_FALSE(worker->activity(old_generation));
}

TEST_F(WindowRuntimeTest, RepeatedLaunchPreparationReusesTheLiveGenerationWithoutRestoringWindows) {
  const auto generation = prepare();
  runtime.stream_started(generation, 11, true);
  EXPECT_EQ(prepare(), generation);
  EXPECT_EQ(workers.size(), 1u);
  EXPECT_EQ(workers.front()->stop_calls, 0);
  EXPECT_TRUE(workers.front()->admitted);
}

TEST_F(WindowRuntimeTest, DisabledPreparationCannotReuseAnAlreadyAuthorizedWorker) {
  const auto generation = prepare();
  runtime.stream_started(generation, 11, true);
  wm::settings options;
  options.policy = wm::mode::disabled;
  options.application_uuid = "desktop-fixture";
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  EXPECT_FALSE(workers.front()->admitted);
  EXPECT_EQ(workers.front()->stop_calls, 1);
  EXPECT_FALSE(runtime.recover_windows());
}

TEST(WindowRuntimeState, UnsupportedPlatformDoesNotStartOrAuthorizeAnything) {
  wm::runtime_state runtime;
  wm::settings options;
  options.application_uuid = "desktop-fixture";
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  EXPECT_FALSE(runtime.status().supported);
  EXPECT_FALSE(runtime.recover_windows());
}

TEST(WindowRuntimeState, MissingExecutorFailsOpenAndReportsStartupFailure) {
  wm::runtime_state runtime {[](wm::settings, wm::session_context, wm::activity_reader) {
    return std::shared_ptr<wm::runtime_worker> {};
  }};
  wm::settings options;
  options.application_uuid = "desktop-fixture";
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  EXPECT_EQ(runtime.status().phase, wm::runtime_phase::failed);
  EXPECT_EQ(runtime.status().reason, "worker_start_failed");
  EXPECT_FALSE(runtime.recover_windows());
}

TEST(WindowRuntimeState, ExecutorStartupExceptionDoesNotEscapeIntoStreaming) {
  wm::runtime_state runtime {[](wm::settings, wm::session_context, wm::activity_reader) -> std::shared_ptr<wm::runtime_worker> {
    throw std::runtime_error("fixture startup failure");
  }};
  wm::settings options;
  options.application_uuid = "desktop-fixture";
  EXPECT_EQ(runtime.prepare(options, "desktop-fixture", "virtual-fixture"), 0u);
  EXPECT_EQ(runtime.status().phase, wm::runtime_phase::failed);
  EXPECT_EQ(runtime.status().reason, "worker_start_failed");
}
