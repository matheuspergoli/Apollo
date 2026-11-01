#ifdef _WIN32
  #include "src/platform/windows/window_desktop.h"

  #include <algorithm>
  #include <array>
  #include <gtest/gtest.h>
  #include <iostream>
  #include <thread>
  #include <windows.h>
  #include <wtsapi32.h>

namespace {
  namespace wm = window_management;
  namespace native = window_management::win32;

  std::wstring name_of(HANDLE object) {
    std::array<wchar_t, 256> buffer {};
    DWORD returned = 0;
    return GetUserObjectInformationW(object, UOI_NAME, buffer.data(), sizeof(buffer), &returned) ? buffer.data() : L"";
  }

  class WindowDesktopTest: public testing::Test {
  protected:
    void SetUp() override {
      DWORD session = 0;
      ASSERT_TRUE(ProcessIdToSessionId(GetCurrentProcessId(), &session));
      if (!session || session != WTSGetActiveConsoleSessionId() ||
          name_of(GetProcessWindowStation()) != L"WinSta0" || name_of(GetThreadDesktop(GetCurrentThreadId())) != L"Default") {
        GTEST_SKIP() << "An interactive console desktop is unavailable; window operations are untested here.";
      }
      auto input = OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS);
      if (!input) {
        GTEST_SKIP() << "Input desktop is inaccessible; no Secure Desktop access is attempted.";
      }
      const auto input_name = name_of(input);
      CloseDesktop(input);
      if (input_name != L"Default") {
        GTEST_SKIP() << "The input desktop is not Default; no windows will be created.";
      }
      unsigned long error = 0;
      desktop = native::window_desktop::open(error);
      ASSERT_NE(desktop, nullptr) << error;

      MONITORINFOEXW monitor {};
      monitor.cbSize = sizeof(monitor);
      const auto handle = MonitorFromPoint({0, 0}, MONITOR_DEFAULTTONULL);
      if (!handle) {
        GTEST_SKIP() << "No display is available to host test-owned windows.";
      }
      ASSERT_TRUE(GetMonitorInfoW(handle, reinterpret_cast<MONITORINFO *>(&monitor)));
      // Check CCD availability directly before using the production resolver.
      // Do not adapt/install a driver to make this runner qualify display paths.
      UINT32 paths = 0;
      UINT32 modes = 0;
      const auto status = GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &paths, &modes);
      if (status == ERROR_ACCESS_DENIED || status == ERROR_NOT_SUPPORTED) {
        GTEST_SKIP() << "Active CCD paths are unavailable; placement is untested in this environment.";
      }
      ASSERT_EQ(status, ERROR_SUCCESS);
      if (!paths) {
        GTEST_SKIP() << "No active CCD path exists; placement is untested in this environment.";
      }
      const auto origin = native::origin_for_source(monitor.szDevice);
      ASSERT_TRUE(origin.target) << origin.error;
      destination = *origin.target;
      const int width = (destination.work.right - destination.work.left) / 2;
      const int height = (destination.work.bottom - destination.work.top) / 2;
      ASSERT_GT(width, 100);
      ASSERT_GT(height, 100);
      window = CreateWindowExW(0, L"STATIC", L"Apollo window contract fixture", WS_OVERLAPPEDWINDOW, destination.work.left + 10, destination.work.top + 10, width, height, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
      ASSERT_NE(window, nullptr);
      ShowWindow(window, SW_SHOWNOACTIVATE);
    }

    void TearDown() override {
      for (auto child : auxiliary) {
        DestroyWindow(child);
      }
      if (window) {
        DestroyWindow(window);
      }
      desktop.reset();
    }

    native::window_result inspect(HWND handle = nullptr, std::uint64_t incarnation = 1) {
      return desktop->inspect(reinterpret_cast<std::uintptr_t>(handle ? handle : window), incarnation);
    }

    std::unique_ptr<native::window_desktop> desktop;
    native::target_snapshot destination;
    HWND window = nullptr;
    std::vector<HWND> auxiliary;
  };
}  // namespace

TEST_F(WindowDesktopTest, EnumeratesAndInspectsOnlyTestOwnedWindowWithoutChangingPlacement) {
  RECT before {};
  ASSERT_TRUE(GetWindowRect(window, &before));
  const auto inventory = desktop->enumerate();
  EXPECT_EQ(inventory.error, 0ul);
  EXPECT_NE(std::find(inventory.handles.begin(), inventory.handles.end(), reinterpret_cast<std::uintptr_t>(window)), inventory.handles.end());
  const auto result = inspect();
  ASSERT_TRUE(result.window) << result.error;
  EXPECT_EQ(result.window->identity.process_id, static_cast<std::uint32_t>(GetCurrentProcessId()));
  EXPECT_EQ(result.window->identity.incarnation, 1u);
  EXPECT_NE(result.window->identity.process_created, 0u);
  EXPECT_TRUE(result.window->traits.visible);
  EXPECT_TRUE(result.window->traits.top_level);
  EXPECT_FALSE(result.window->traits.owned);
  EXPECT_TRUE(result.window->traits.same_desktop);
  EXPECT_TRUE(result.window->traits.same_session);
  EXPECT_TRUE(result.window->traits.interactive_user);
  EXPECT_FALSE(result.window->origin.monitor_device_path.empty());
  RECT after {};
  ASSERT_TRUE(GetWindowRect(window, &after));
  EXPECT_EQ(before.left, after.left);
  EXPECT_EQ(before.top, after.top);
  EXPECT_EQ(before.right, after.right);
  EXPECT_EQ(before.bottom, after.bottom);
}

TEST_F(WindowDesktopTest, RejectsZeroIdentityAndDestroyedWindows) {
  EXPECT_FALSE(desktop->inspect(0, 1).window);
  EXPECT_FALSE(inspect(nullptr, 0).window);
  auto handle = window;
  ASSERT_TRUE(DestroyWindow(window));
  window = nullptr;
  EXPECT_FALSE(desktop->inspect(reinterpret_cast<std::uintptr_t>(handle), 1).window);
}

TEST_F(WindowDesktopTest, RefusesANonInputDesktopWithoutSwitchingTheVisibleDesktop) {
  const auto name = L"ApolloWindowContract-" + std::to_wstring(GetCurrentProcessId());
  auto private_desktop = CreateDesktopW(name.c_str(), nullptr, nullptr, 0, GENERIC_ALL, nullptr);
  ASSERT_NE(private_desktop, nullptr);
  bool assigned = false;
  bool refused = false;
  std::thread worker([&] {
    assigned = SetThreadDesktop(private_desktop);
    unsigned long error = 0;
    const auto forbidden = native::window_desktop::open(error);
    refused = !forbidden && error == ERROR_ACCESS_DENIED;
  });
  worker.join();
  EXPECT_TRUE(CloseDesktop(private_desktop));
  EXPECT_TRUE(assigned);
  EXPECT_TRUE(refused);
  const auto current = inspect();
  EXPECT_TRUE(current.window) << current.error;
}

TEST_F(WindowDesktopTest, AuxiliaryAndOwnedWindowsAreNotEligible) {
  auto tool = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"STATIC", L"", WS_POPUP, destination.work.left + 20, destination.work.top + 20, 100, 100, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
  ASSERT_NE(tool, nullptr);
  auxiliary.push_back(tool);
  ShowWindow(tool, SW_SHOWNOACTIVATE);
  auto owned = CreateWindowExW(0, L"STATIC", L"", WS_OVERLAPPEDWINDOW, destination.work.left + 20, destination.work.top + 20, 100, 100, window, nullptr, GetModuleHandleW(nullptr), nullptr);
  ASSERT_NE(owned, nullptr);
  auxiliary.push_back(owned);
  ShowWindow(owned, SW_SHOWNOACTIVATE);
  const auto tool_result = inspect(tool);
  ASSERT_TRUE(tool_result.window) << tool_result.error;
  EXPECT_TRUE(tool_result.window->traits.tool_window);
  EXPECT_FALSE(wm::window_allowed(tool_result.window->traits));
  const auto owned_result = inspect(owned);
  ASSERT_TRUE(owned_result.window) << owned_result.error;
  EXPECT_TRUE(owned_result.window->traits.owned);
  EXPECT_FALSE(wm::window_allowed(owned_result.window->traits));
}

TEST_F(WindowDesktopTest, StaleSnapshotCannotMoveAWindow) {
  const auto result = inspect();
  ASSERT_TRUE(result.window) << result.error;
  auto stale = *result.window;
  ++stale.identity.process_created;
  auto desired = stale.position;
  desired.normal.left += 10;
  desired.normal.right += 10;
  const auto request = desktop->submit(stale, desired, destination, true);
  EXPECT_NE(request.status, native::placement_status::submitted);
  const auto after = inspect();
  ASSERT_TRUE(after.window) << after.error;
  EXPECT_EQ(after.window->position, result.window->position);
}

TEST_F(WindowDesktopTest, NeverRestoresAMinimizedFixtureToMoveIt) {
  ShowWindow(window, SW_SHOWMINNOACTIVE);
  const auto result = inspect();
  ASSERT_TRUE(result.window) << result.error;
  EXPECT_EQ(result.window->position.state, wm::show_state::minimized);
  auto desired = result.window->position;
  desired.normal.left += 10;
  desired.normal.right += 10;
  EXPECT_EQ(desktop->submit(*result.window, desired, destination, true).status, native::placement_status::rejected);
  EXPECT_TRUE(IsIconic(window));
}

TEST_F(WindowDesktopTest, OrdinaryFixtureMovesWithoutFocusOrSizeChangeAndElevatedFixtureIsRejected) {
  const auto result = inspect();
  ASSERT_TRUE(result.window) << result.error;
  const auto before_focus = GetForegroundWindow();
  auto desired = result.window->position;
  desired.normal.left += 10;
  desired.normal.right += 10;
  desired.normal.top += 10;
  desired.normal.bottom += 10;
  const auto request = desktop->submit(*result.window, desired, destination, true);
  if (result.window->traits.elevated) {
    RecordProperty("placement_coverage", "elevated-token-refusal-only");
    std::cout << "[ WSM COVERAGE ] Elevated fixture: testing refusal, not ordinary-window movement.\n";
    EXPECT_EQ(request.status, native::placement_status::rejected);
  } else {
    RecordProperty("placement_coverage", "ordinary-window-placement");
    std::cout << "[ WSM COVERAGE ] Ordinary fixture: testing native placement without activation.\n";
    ASSERT_EQ(request.status, native::placement_status::submitted) << request.error;
  }
  const auto after = inspect();
  ASSERT_TRUE(after.window) << after.error;
  EXPECT_EQ(after.window->position, result.window->traits.elevated ? result.window->position : desired);
  EXPECT_EQ(GetForegroundWindow(), before_focus);
}

TEST_F(WindowDesktopTest, MaximizedFixtureRetainsStateAndElevatedFixtureIsNotMoved) {
  ShowWindow(window, SW_SHOWMAXIMIZED);
  const auto result = inspect();
  ASSERT_TRUE(result.window) << result.error;
  ASSERT_EQ(result.window->position.state, wm::show_state::maximized);
  const auto before_focus = GetForegroundWindow();
  auto desired = result.window->position;
  desired.normal.left += 10;
  desired.normal.right += 10;
  const auto request = desktop->submit(*result.window, desired, destination, true);
  if (result.window->traits.elevated) {
    RecordProperty("placement_coverage", "elevated-token-refusal-only");
    std::cout << "[ WSM COVERAGE ] Elevated fixture: testing refusal, not maximized-window movement.\n";
    EXPECT_EQ(request.status, native::placement_status::rejected);
  } else {
    RecordProperty("placement_coverage", "foreground-maximized-window-placement");
    std::cout << "[ WSM COVERAGE ] Ordinary maximized fixture: testing state preservation.\n";
    ASSERT_EQ(request.status, native::placement_status::submitted) << request.error;
  }
  const auto after = inspect();
  ASSERT_TRUE(after.window) << after.error;
  EXPECT_EQ(after.window->position.state, wm::show_state::maximized);
  EXPECT_EQ(after.window->position.normal, result.window->traits.elevated ? result.window->position.normal : desired.normal);
  EXPECT_EQ(GetForegroundWindow(), before_focus);
}
#endif
