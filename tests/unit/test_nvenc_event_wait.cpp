#ifdef _WIN32
  #include <gtest/gtest.h>
  #include <thread>
  #include "../../src/nvenc/nvenc_event_wait.h"

TEST(NvencEventWait, SignaledEventCompletes) {
  auto event = CreateEventW(nullptr, TRUE, TRUE, nullptr);
  ASSERT_NE(event, nullptr);
  const auto result = nvenc::wait_for_completion_event(event, 0);
  EXPECT_EQ(result.status, nvenc::event_wait_status::completed);
  EXPECT_EQ(result.error, ERROR_SUCCESS);
  CloseHandle(event);
}

TEST(NvencEventWait, TimeoutDoesNotReportStaleWindowsError) {
  auto event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  ASSERT_NE(event, nullptr);
  SetLastError(ERROR_ACCESS_DENIED);
  const auto result = nvenc::wait_for_completion_event(event, 0);
  EXPECT_EQ(result.status, nvenc::event_wait_status::timed_out);
  EXPECT_EQ(result.native_status, WAIT_TIMEOUT);
  EXPECT_EQ(result.error, ERROR_SUCCESS);
  CloseHandle(event);
}

TEST(NvencEventWait, InvalidHandleCapturesFailureImmediately) {
  const auto result = nvenc::wait_for_completion_event(nullptr, 0);
  SetLastError(ERROR_ACCESS_DENIED);
  EXPECT_EQ(result.status, nvenc::event_wait_status::failed);
  EXPECT_EQ(result.native_status, WAIT_FAILED);
  EXPECT_EQ(result.error, ERROR_INVALID_HANDLE);
}

TEST(NvencEventWait, AbandonedWaitIsNotSuccessOrTimeout) {
  auto mutex = CreateMutexW(nullptr, FALSE, nullptr);
  ASSERT_NE(mutex, nullptr);
  DWORD acquired = WAIT_FAILED;
  std::thread owner([&]() {
    acquired = WaitForSingleObject(mutex, 1000);
  });
  owner.join();
  EXPECT_EQ(acquired, WAIT_OBJECT_0);
  const auto result = nvenc::wait_for_completion_event(mutex, 0);
  EXPECT_EQ(result.status, nvenc::event_wait_status::unexpected);
  EXPECT_EQ(result.native_status, WAIT_ABANDONED);
  EXPECT_EQ(result.error, ERROR_SUCCESS);
  if (result.native_status == WAIT_ABANDONED) {
    ReleaseMutex(mutex);
  }
  CloseHandle(mutex);
}
#endif
