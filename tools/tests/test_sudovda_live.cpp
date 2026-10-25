// Runs only on the disposable Windows runner, after an explicit driver install.
// Only the randomly generated test monitor is removed; no existing display is reset.
#include <Windows.h>
#include <winioctl.h>
#include <objbase.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <atomic>
#include <thread>
#include <vector>
#include "third-party/sudovda/sudovda.h"

int main() {
  const char *actions = std::getenv("GITHUB_ACTIONS");
  const char *repository = std::getenv("GITHUB_REPOSITORY");
  if (!actions || !repository || std::strcmp(actions, "true") || std::strcmp(repository, "matheuspergoli/Apollo")) {
    std::fputs("Live driver test is restricted to the isolated fork runner\n", stderr);
    return 1;
  }
  auto device = SUDOVDA::OpenDevice(&SUDOVDA::SUVDA_INTERFACE_GUID);
  if (device == INVALID_HANDLE_VALUE) return 2;
  if (!SUDOVDA::CheckProtocolCompatible(device)) { CloseHandle(device); return 3; }
  GUID monitor {};
  if (FAILED(CoCreateGuid(&monitor))) { CloseHandle(device); return 4; }
  SUDOVDA::VIRTUAL_DISPLAY_ADD_OUT output {};
  SUDOVDA::VIRTUAL_DISPLAY_GET_WATCHDOG_OUT watchdog {};
  if (!SUDOVDA::GetWatchdogTimeout(device, watchdog)) { CloseHandle(device); return 4; }
  auto stop = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!stop) { CloseHandle(device); return 4; }
  std::atomic<bool> ping_failed {false};
  std::thread pinger;
  if (watchdog.Timeout) {
    pinger = std::thread([&]() {
      while (WaitForSingleObject(stop, 250) == WAIT_TIMEOUT) {
        if (!SUDOVDA::PingDriver(device)) ping_failed = true;
      }
    });
  }
  bool created = SUDOVDA::AddVirtualDisplay(device, 1920, 1080, 60000, monitor, "CI display", "CI session", output);
  // A failed add can still have created a monitor. Always attempt owned cleanup.
  bool removed = SUDOVDA::RemoveVirtualDisplay(device, monitor);
  SetEvent(stop);
  if (pinger.joinable()) pinger.join();
  CloseHandle(stop);
  CloseHandle(device);
  if (!created || !removed || ping_failed) return 5;
  std::puts("Live SudoVDA control test passed: interface, protocol, create and owned removal.");
  return 0;
}
