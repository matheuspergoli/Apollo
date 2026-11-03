#include "window_desktop.h"

// standard includes
#include <algorithm>
#include <array>
#include <limits>
#include <utility>

// platform includes
#include <windows.h>
// DWM declarations require the Windows base types above.
#include <dwmapi.h>
#include <wtsapi32.h>

namespace window_management::win32 {
  namespace {
    struct owned_handle {
      HANDLE value = nullptr;
      owned_handle() = default;
      owned_handle(const owned_handle &) = delete;
      owned_handle &operator=(const owned_handle &) = delete;

      ~owned_handle() {
        if (value) {
          CloseHandle(value);
        }
      }
    };

    struct owned_desktop {
      HDESK value;

      ~owned_desktop() {
        if (value) {
          CloseDesktop(value);
        }
      }
    };

    DWORD error_or(DWORD fallback = ERROR_GEN_FAILURE) {
      const auto error = GetLastError();
      return error ? error : fallback;
    }

    std::wstring object_name(HANDLE object) {
      std::array<wchar_t, 256> buffer {};
      DWORD needed = 0;
      if (!GetUserObjectInformationW(object, UOI_NAME, buffer.data(), sizeof(buffer), &needed)) {
        return {};
      }
      return buffer.data();
    }

    bool receives_input(HDESK desktop) {
      BOOL input = FALSE;
      DWORD needed = 0;
      return desktop && GetUserObjectInformationW(desktop, UOI_IO, &input, sizeof(input), &needed) && input;
    }

    bool default_input_desktop() {
      owned_desktop desktop {OpenInputDesktop(0, FALSE, DESKTOP_READOBJECTS)};
      if (!desktop.value) {
        return false;
      }
      return object_name(desktop.value) == L"Default";
    }

    std::vector<unsigned char> token_data(HANDLE token, TOKEN_INFORMATION_CLASS kind) {
      DWORD bytes = 0;
      GetTokenInformation(token, kind, nullptr, 0, &bytes);
      if (!bytes || bytes > 65536) {
        return {};
      }
      std::vector<unsigned char> result(bytes);
      if (!GetTokenInformation(token, kind, result.data(), bytes, &bytes)) {
        return {};
      }
      return result;
    }

    screen_rect screen(RECT rect) {
      return {static_cast<std::int32_t>(rect.left), static_cast<std::int32_t>(rect.top), static_cast<std::int32_t>(rect.right), static_cast<std::int32_t>(rect.bottom)};
    }

    struct dpi_probe {
      HWND window = nullptr;
      screen_rect bounds;
      dpi_probe() = default;
      dpi_probe(const dpi_probe &) = delete;
      dpi_probe &operator=(const dpi_probe &) = delete;

      ~dpi_probe() {
        if (window) {
          DestroyWindow(window);
        }
      }
    };

    bool shell_window(HWND window) {
      if (window == GetShellWindow() || window == GetDesktopWindow()) {
        return true;
      }
      std::array<wchar_t, 256> name {};
      if (!GetClassNameW(window, name.data(), static_cast<int>(name.size()))) {
        return true;
      }
      for (const auto *excluded : {L"Shell_TrayWnd", L"Shell_SecondaryTrayWnd", L"Progman", L"WorkerW", L"tooltips_class32", L"#32768"}) {
        if (std::wstring_view(name.data()) == excluded) {
          return true;
        }
      }
      return false;
    }

    bool overlaps(screen_rect a, screen_rect b) {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }
  }  // namespace

  struct window_desktop::impl {
    DWORD owner_thread = GetCurrentThreadId();
    DWORD session = 0;
    std::vector<unsigned char> user_sid;
    DPI_AWARENESS_CONTEXT old_dpi = nullptr;
    std::vector<std::unique_ptr<dpi_probe>> probes;
    admission_predicate admission;

    bool admitted(bool restoration) const noexcept {
      try {
        return !admission || admission(restoration);
      } catch (...) {
        return false;
      }
    }

    ~impl() {
      probes.clear();
      if (old_dpi) {
        SetThreadDpiAwarenessContext(old_dpi);
      }
    }

    bool available() const {
      return owner_thread == GetCurrentThreadId() &&
             session == WTSGetActiveConsoleSessionId() &&
             GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext()) == DPI_AWARENESS_PER_MONITOR_AWARE &&
             object_name(GetThreadDesktop(owner_thread)) == L"Default" &&
             receives_input(GetThreadDesktop(owner_thread)) && default_input_desktop();
    }

    std::optional<monitor_area> read_area(const target_snapshot &target) {
      dpi_probe *probe = nullptr;
      for (const auto &item : probes) {
        if (item->bounds == target.bounds) {
          MONITORINFO info {};
          info.cbSize = sizeof(info);
          const auto monitor = MonitorFromWindow(item->window, MONITOR_DEFAULTTONULL);
          if (monitor && GetMonitorInfoW(monitor, &info) && screen(info.rcMonitor) == target.bounds) {
            probe = item.get();
            break;
          }
        }
      }
      if (!probe) {
        if (probes.size() >= 32) {
          return std::nullopt;
        }
        auto item = std::make_unique<dpi_probe>();
        item->bounds = target.bounds;
        // An invisible, non-activating window owned by the WSM thread supplies
        // per-monitor DPI without using the DPI-virtualized GetDpiForMonitor.
        item->window = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"STATIC", L"", WS_POPUP, target.bounds.left, target.bounds.top, 1, 1, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
        if (!item->window) {
          return std::nullopt;
        }
        probe = item.get();
        probes.push_back(std::move(item));
      }
      const auto dpi = GetDpiForWindow(probe->window);
      if (dpi < 48 || dpi > 960) {
        return std::nullopt;
      }
      return monitor_area {target.bounds, target.work, dpi};
    }
  };

  window_desktop::window_desktop(std::unique_ptr<impl> implementation):
      impl_(std::move(implementation)) {}

  window_desktop::~window_desktop() = default;

  std::unique_ptr<window_desktop> window_desktop::open(unsigned long &error, admission_predicate admission) {
    error = ERROR_ACCESS_DENIED;
    auto implementation = std::make_unique<impl>();
    implementation->admission = std::move(admission);
    if (!ProcessIdToSessionId(GetCurrentProcessId(), &implementation->session) || !implementation->session ||
        implementation->session != WTSGetActiveConsoleSessionId() ||
        object_name(GetProcessWindowStation()) != L"WinSta0" ||
        object_name(GetThreadDesktop(GetCurrentThreadId())) != L"Default" ||
        !receives_input(GetThreadDesktop(GetCurrentThreadId())) || !default_input_desktop()) {
      return {};
    }
    owned_handle process_token;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &process_token.value)) {
      error = error_or();
      return {};
    }
    auto data = token_data(process_token.value, TokenUser);
    if (data.empty()) {
      return {};
    }
    auto user = reinterpret_cast<TOKEN_USER *>(data.data());
    owned_handle interactive_token;
    if (IsWellKnownSid(user->User.Sid, WinLocalSystemSid)) {
      if (!WTSQueryUserToken(implementation->session, &interactive_token.value)) {
        error = error_or();
        return {};
      }
      data = token_data(interactive_token.value, TokenUser);
      if (data.empty()) {
        return {};
      }
      user = reinterpret_cast<TOKEN_USER *>(data.data());
    }
    if (!IsValidSid(user->User.Sid) || IsWellKnownSid(user->User.Sid, WinLocalSystemSid) ||
        IsWellKnownSid(user->User.Sid, WinLocalServiceSid) || IsWellKnownSid(user->User.Sid, WinNetworkServiceSid)) {
      return {};
    }
    const auto length = GetLengthSid(user->User.Sid);
    implementation->user_sid.resize(length);
    if (!CopySid(length, implementation->user_sid.data(), user->User.Sid)) {
      error = error_or();
      return {};
    }
    implementation->old_dpi = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if (!implementation->old_dpi) {
      error = error_or();
      return {};
    }
    error = ERROR_SUCCESS;
    return std::unique_ptr<window_desktop>(new window_desktop(std::move(implementation)));
  }

  window_inventory window_desktop::enumerate() {
    window_inventory result;
    if (!impl_->available()) {
      result.error = ERROR_ACCESS_DENIED;
      return result;
    }
    result.handles.reserve(512);
    SetLastError(ERROR_SUCCESS);
    const auto callback = [](HWND window, LPARAM data) -> BOOL {
      auto &inventory = *reinterpret_cast<window_inventory *>(data);
      if (inventory.handles.size() == inventory.handles.capacity()) {
        inventory.truncated = true;
        return FALSE;
      }
      inventory.handles.push_back(reinterpret_cast<std::uintptr_t>(window));
      return TRUE;
    };
    if (!EnumWindows(callback, reinterpret_cast<LPARAM>(&result)) && !result.truncated) {
      result.error = error_or();
      result.handles.clear();
    }
    return result;
  }

  bool window_desktop::interactive() const {
    return impl_->available();
  }

  window_result window_desktop::inspect(std::uintptr_t handle, std::uint64_t incarnation) {
    if (!impl_->available() || !handle || !incarnation) {
      return {{}, ERROR_ACCESS_DENIED, "interactive_context"};
    }
    const auto window = reinterpret_cast<HWND>(handle);
    if (!IsWindow(window)) {
      return {{}, ERROR_INVALID_WINDOW_HANDLE, "window_identity"};
    }
    DWORD process_id = 0;
    const auto thread_id = GetWindowThreadProcessId(window, &process_id);
    DWORD process_session = 0;
    if (!thread_id || !ProcessIdToSessionId(process_id, &process_session) || process_session != impl_->session ||
        object_name(GetThreadDesktop(thread_id)) != L"Default" || !receives_input(GetThreadDesktop(thread_id))) {
      return {{}, ERROR_ACCESS_DENIED, "window_session"};
    }
    owned_handle process;
    process.value = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, process_id);
    if (!process.value) {
      return {{}, error_or(ERROR_ACCESS_DENIED), "process_access"};
    }
    owned_handle token;
    if (!OpenProcessToken(process.value, TOKEN_QUERY, &token.value)) {
      return {{}, error_or(ERROR_ACCESS_DENIED), "token_access"};
    }
    const auto user = token_data(token.value, TokenUser);
    if (user.empty() || !EqualSid(reinterpret_cast<const TOKEN_USER *>(user.data())->User.Sid, impl_->user_sid.data())) {
      return {{}, ERROR_ACCESS_DENIED, "user_identity"};
    }
    const auto integrity = token_data(token.value, TokenIntegrityLevel);
    if (integrity.size() < sizeof(TOKEN_MANDATORY_LABEL)) {
      return {{}, ERROR_ACCESS_DENIED, "integrity"};
    }
    const auto integrity_sid = reinterpret_cast<const TOKEN_MANDATORY_LABEL *>(integrity.data())->Label.Sid;
    if (!IsValidSid(integrity_sid) || !*GetSidSubAuthorityCount(integrity_sid)) {
      return {{}, ERROR_ACCESS_DENIED, "integrity"};
    }
    const auto integrity_level = *GetSidSubAuthority(integrity_sid, *GetSidSubAuthorityCount(integrity_sid) - 1);
    TOKEN_ELEVATION elevation {};
    DWORD ui_access = 0;
    DWORD returned = 0;
    FILETIME created {}, exited {}, kernel {}, cpu {};
    PROCESS_PROTECTION_LEVEL_INFORMATION protection {};
    if (!GetTokenInformation(token.value, TokenElevation, &elevation, sizeof(elevation), &returned) ||
        !GetTokenInformation(token.value, TokenUIAccess, &ui_access, sizeof(ui_access), &returned) ||
        !GetProcessTimes(process.value, &created, &exited, &kernel, &cpu) ||
        !GetProcessInformation(process.value, ProcessProtectionLevelInfo, &protection, sizeof(protection))) {
      return {{}, error_or(ERROR_ACCESS_DENIED), "process_security"};
    }
    SetLastError(ERROR_SUCCESS);
    const auto style = GetWindowLongPtrW(window, GWL_STYLE);
    if (!style && GetLastError()) {
      return {{}, error_or(), "window_style"};
    }
    SetLastError(ERROR_SUCCESS);
    const auto ex_style = GetWindowLongPtrW(window, GWL_EXSTYLE);
    if (!ex_style && GetLastError()) {
      return {{}, error_or(), "window_style"};
    }
    DWORD cloaked = 0;
    RECT actual {};
    WINDOWPLACEMENT native {};
    native.length = sizeof(native);
    if (FAILED(DwmGetWindowAttribute(window, DWMWA_CLOAKED, &cloaked, sizeof(cloaked))) ||
        !GetWindowRect(window, &actual) || !GetWindowPlacement(window, &native)) {
      return {{}, ERROR_INVALID_WINDOW_HANDLE, "window_geometry"};
    }
    const auto monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONULL);
    MONITORINFOEXW info {};
    info.cbSize = sizeof(info);
    if (!monitor || !GetMonitorInfoW(monitor, reinterpret_cast<MONITORINFO *>(&info))) {
      return {{}, ERROR_NOT_FOUND, "origin_monitor"};
    }
    const auto origin = origin_for_source(info.szDevice);
    if (!origin.target) {
      return {{}, origin.error, "origin_binding"};
    }
    const auto source = impl_->read_area(*origin.target);
    if (!source) {
      return {{}, ERROR_NOT_SUPPORTED, "origin_dpi"};
    }
    const workspace_rect workspace {static_cast<std::int32_t>(native.rcNormalPosition.left), static_cast<std::int32_t>(native.rcNormalPosition.top), static_cast<std::int32_t>(native.rcNormalPosition.right), static_cast<std::int32_t>(native.rcNormalPosition.bottom)};
    const auto normal = ex_style & WS_EX_TOOLWINDOW ? std::optional {screen(native.rcNormalPosition)} : to_screen(workspace, *source);
    if (!normal) {
      return {{}, ERROR_INVALID_DATA, "normal_geometry"};
    }
    observed_window observed;
    observed.identity = {handle, process_id, thread_id, (std::uint64_t(created.dwHighDateTime) << 32) | created.dwLowDateTime, incarnation};
    auto state = show_state::normal;
    if (IsIconic(window)) {
      state = show_state::minimized;
    } else if (IsZoomed(window)) {
      state = show_state::maximized;
    }
    observed.position = {*normal, state};
    observed.origin = *origin.target;
    observed.area = *source;
    auto &traits = observed.traits;
    traits.inspected = true;
    traits.top_level = !(style & WS_CHILD) && GetAncestor(window, GA_ROOT) == window;
    traits.visible = IsWindowVisible(window);
    traits.same_session = traits.same_desktop = traits.interactive_user = true;
    traits.cloaked = cloaked != 0;
    traits.tool_window = ex_style & (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT);
    traits.owned = GetWindow(window, GW_OWNER) != nullptr;
    traits.shell = shell_window(window);
    traits.elevated = elevation.TokenIsElevated != 0 || integrity_level > SECURITY_MANDATORY_MEDIUM_RID;
    traits.protected_window = ui_access != 0 || protection.ProtectionLevel != PROTECTION_LEVEL_NONE;
    traits.fullscreen = !IsZoomed(window) && screen(actual) == source->bounds;
    DWORD final_pid = 0;
    if (GetWindowThreadProcessId(window, &final_pid) != thread_id || final_pid != process_id) {
      return {{}, ERROR_INVALID_WINDOW_HANDLE, "window_identity"};
    }
    return {std::move(observed), ERROR_SUCCESS};
  }

  std::optional<monitor_area> window_desktop::area(const target_snapshot &target) {
    return impl_->available() ? impl_->read_area(target) : std::nullopt;
  }

  target_result window_desktop::resolve(std::wstring_view device_path, bool restoration) {
    if (!impl_->available()) {
      return {{}, ERROR_ACCESS_DENIED};
    }
    return restoration ? refresh_origin(device_path) : refresh_target(device_path);
  }

  placement_result window_desktop::submit(const observed_window &expected, placement desired, const target_snapshot &destination, bool restoration) {
    if (!impl_->admitted(restoration) || !window_allowed(expected.traits)) {
      return {placement_status::rejected, ERROR_ACCESS_DENIED, "admission"};
    }
    const auto fresh = inspect(expected.identity.handle, expected.identity.incarnation);
    if (!fresh.window) {
      return {placement_status::rejected, fresh.error, fresh.error_stage};
    }
    const auto &current = *fresh.window;
    if (current.identity != expected.identity || current.position != expected.position || current.origin.monitor_device_path != expected.origin.monitor_device_path) {
      return {placement_status::stale, ERROR_RETRY, "window_snapshot"};
    }
    if (!window_allowed(current.traits) || current.position.state == show_state::minimized || desired.state != current.position.state) {
      return {placement_status::rejected, ERROR_ACCESS_DENIED, "eligibility"};
    }
    const auto target = restoration ? refresh_origin(destination.monitor_device_path) : refresh_target(destination.monitor_device_path);
    if (!target.target || target.target->bounds != destination.bounds || target.target->work != destination.work) {
      return {placement_status::stale, target.error ? target.error : ERROR_RETRY, "destination_binding"};
    }
    const auto target_area = impl_->read_area(*target.target);
    const auto width = std::int64_t(desired.normal.right) - desired.normal.left;
    const auto height = std::int64_t(desired.normal.bottom) - desired.normal.top;
    if (!target_area || width <= 0 || height <= 0 || width > std::numeric_limits<int>::max() || height > std::numeric_limits<int>::max() ||
        !overlaps(desired.normal, destination.work)) {
      return {placement_status::rejected, ERROR_INVALID_PARAMETER, "destination_geometry"};
    }
    const auto visible_width = std::min<std::int64_t>(desired.normal.right, destination.work.right) - std::max<std::int64_t>(desired.normal.left, destination.work.left);
    const auto caption_height = std::min(height, std::int64_t(32) * target_area->dpi / 96);
    if (desired.normal.top < destination.work.top || std::int64_t(desired.normal.top) + caption_height > destination.work.bottom ||
        visible_width < std::min(width, std::int64_t(160) * target_area->dpi / 96) ||
        (!restoration && (desired.normal.left < destination.work.left || desired.normal.right > destination.work.right || desired.normal.bottom > destination.work.bottom))) {
      return {placement_status::rejected, ERROR_INVALID_PARAMETER, "destination_geometry"};
    }
    if (desired == current.position && current.origin.monitor_device_path == destination.monitor_device_path) {
      return {placement_status::unchanged, ERROR_SUCCESS};
    }
    const auto window = reinterpret_cast<HWND>(expected.identity.handle);
    DWORD_PTR response = 0;
    if (IsHungAppWindow(window) || !SendMessageTimeoutW(window, WM_NULL, 0, 0, SMTO_ABORTIFHUNG | SMTO_BLOCK, 25, &response)) {
      return {placement_status::rejected, ERROR_TIMEOUT, "responsiveness"};
    }
    // The responsiveness probe can pump the application's own messages. Re-read
    // afterward so a position/state/identity change during that probe is not
    // overwritten using the earlier observation.
    const auto rechecked = inspect(expected.identity.handle, expected.identity.incarnation);
    if (!rechecked.window || rechecked.window->identity != current.identity || rechecked.window->position != current.position ||
        rechecked.window->origin.monitor_device_path != current.origin.monitor_device_path || !window_allowed(rechecked.window->traits)) {
      return {placement_status::stale, ERROR_RETRY, "final_snapshot"};
    }
    BOOL submitted = FALSE;
    if (desired.state == show_state::normal) {
      if (!impl_->available() || !impl_->admitted(restoration)) {
        return {placement_status::rejected, ERROR_ACCESS_DENIED, "admission"};
      }
      submitted = SetWindowPos(window, nullptr, desired.normal.left, desired.normal.top, static_cast<int>(width), static_cast<int>(height), SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER);
    } else {
      const auto workspace = to_workspace(desired.normal, *target_area);
      RECT actual {};
      WINDOWPLACEMENT native {};
      native.length = sizeof(native);
      if (!workspace || !GetWindowPlacement(window, &native) || !GetWindowRect(window, &actual)) {
        return {placement_status::failed, ERROR_INVALID_DATA, "normal_geometry"};
      }
      const auto frame = plan_maximized_frame(screen(actual), rechecked.window->area, *target_area);
      if (!frame || std::int64_t(frame->right) - frame->left > std::numeric_limits<int>::max() ||
          std::int64_t(frame->bottom) - frame->top > std::numeric_limits<int>::max()) {
        return {placement_status::rejected, ERROR_INVALID_DATA, "maximized_geometry"};
      }
      native.rcNormalPosition = {workspace->left, workspace->top, workspace->right, workspace->bottom};
      // Reusing SW_SHOWMAXIMIZED can activate a background window. SW_SHOWNA
      // preserves its current show state without activation; SW_SHOWNOACTIVATE
      // is not equivalent, because that command can restore normal state.
      native.showCmd = SW_SHOWNA;
      native.flags |= WPF_ASYNCWINDOWPLACEMENT;
      if (!impl_->available() || !impl_->admitted(restoration)) {
        return {placement_status::rejected, ERROR_ACCESS_DENIED, "admission"};
      }
      // Changing rcNormalPosition alone can leave a maximized frame on the old
      // monitor until a later user restore. Move the actual frame without changing
      // show state/focus/Z-order, then set its separate future restore rectangle.
      // These asynchronous requests are not an atomic transaction: only the
      // controller's later observation can establish ownership/completion.
      if (!SetWindowPos(window, nullptr, frame->left, frame->top, static_cast<int>(std::int64_t(frame->right) - frame->left), static_cast<int>(std::int64_t(frame->bottom) - frame->top), SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER)) {
        return {placement_status::failed, error_or(), "set_maximized_frame"};
      }
      if (!impl_->available() || !impl_->admitted(restoration)) {
        return {placement_status::rejected, ERROR_ACCESS_DENIED, "admission"};
      }
      submitted = SetWindowPlacement(window, &native);
    }
    return submitted ? placement_result {placement_status::submitted, ERROR_SUCCESS} : placement_result {placement_status::failed, error_or(), desired.state == show_state::normal ? "set_window_pos" : "set_window_placement"};
  }
}  // namespace window_management::win32
