#ifdef _WIN32
  #include "src/platform/windows/window_target.h"

  #include <gtest/gtest.h>
  #include <windows.h>

namespace {
  namespace wm = window_management::win32;
}

TEST(WindowTarget, RejectsEmptyAndEmbeddedNullIdentitiesBeforeQueryingWindows) {
  for (bool by_path : {false, true}) {
    const auto resolve = by_path ? wm::refresh_target : wm::bind_target;
    auto result = resolve({});
    EXPECT_FALSE(result.target);
    EXPECT_EQ(result.error, static_cast<unsigned long>(ERROR_INVALID_PARAMETER));
    result = resolve(std::wstring_view(L"fixture\0other", 13));
    EXPECT_FALSE(result.target);
    EXPECT_EQ(result.error, static_cast<unsigned long>(ERROR_INVALID_PARAMETER));
    result = resolve(std::wstring(32768, L'x'));
    EXPECT_FALSE(result.target);
    EXPECT_EQ(result.error, static_cast<unsigned long>(ERROR_INVALID_PARAMETER));
  }
}

TEST(WindowTarget, UnknownIdentityNeverFallsBackToAPhysicalOrPrimaryMonitor) {
  // Only queries the runner. No assumption that this environment has a usable
  // interactive display; both absent identity and unavailable desktop must fail
  // without selecting another monitor. This does not qualify a virtual driver.
  for (const auto resolve : {wm::bind_target, wm::refresh_target}) {
    const auto result = resolve(L"apollo-test-nonexistent-window-target-identity");
    EXPECT_FALSE(result.target);
    EXPECT_NE(result.error, static_cast<unsigned long>(ERROR_SUCCESS));
  }
}
#endif
