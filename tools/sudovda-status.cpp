/**
 * Read-only SudoVDA interface probe. It never creates/removes monitors,
 * installs packages, changes certificates or starts services.
 */
#include <Windows.h>
#include <winioctl.h>
#include <cstdio>
#include <cstring>
#include "third-party/sudovda/sudovda.h"

int main(int argc, char **argv) {
  if (argc == 2 && std::strcmp(argv[1], "--help") == 0) {
    std::puts("sudovda-status: query the installed driver interface and protocol without changing displays");
    return 0;
  }
  if (argc != 1) {
    std::fputs("Unsupported argument\n", stderr);
    return 1;
  }
  auto handle = SUDOVDA::OpenDevice(&SUDOVDA::SUVDA_INTERFACE_GUID);
  if (handle == INVALID_HANDLE_VALUE) {
    std::puts("{\"ready\":false,\"reason\":\"device_open_failed\"}");
    return 2;
  }
  bool compatible = SUDOVDA::CheckProtocolCompatible(handle);
  SUDOVDA::VIRTUAL_DISPLAY_GET_WATCHDOG_OUT watchdog {};
  bool responsive = compatible && SUDOVDA::GetWatchdogTimeout(handle, watchdog);
  CloseHandle(handle);
  if (!compatible) {
    std::puts("{\"ready\":false,\"reason\":\"protocol_incompatible\"}");
    return 3;
  }
  if (!responsive) {
    std::puts("{\"ready\":false,\"reason\":\"driver_query_failed\"}");
    return 4;
  }
  std::printf("{\"ready\":true,\"watchdogSeconds\":%u}\n", watchdog.Timeout);
  return 0;
}
