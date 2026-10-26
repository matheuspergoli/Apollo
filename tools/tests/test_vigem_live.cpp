#include <windows.h>
#include <xinput.h>
#include <setupapi.h>
#include <cfgmgr32.h>
#include <ViGEm/Client.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>

static void print_pnp_problems() {
  auto devices = SetupDiGetClassDevsW(nullptr, nullptr, nullptr, DIGCF_ALLCLASSES | DIGCF_PRESENT);
  if (devices == INVALID_HANDLE_VALUE) return;
  SP_DEVINFO_DATA device {};
  device.cbSize = sizeof(device);
  for (DWORD i = 0; SetupDiEnumDeviceInfo(devices, i, &device); ++i) {
    ULONG status = 0;
    ULONG problem = 0;
    if (CM_Get_DevNode_Status(&status, &problem, device.DevInst, 0) != CR_SUCCESS || !problem) continue;
    char id[1024] {};
    char name[1024] {};
    SetupDiGetDeviceInstanceIdA(devices, &device, id, sizeof(id), nullptr);
    SetupDiGetDeviceRegistryPropertyA(devices, &device, SPDRP_DEVICEDESC, nullptr,
                                    reinterpret_cast<PBYTE>(name), sizeof(name), nullptr);
    std::printf("PnP problem=%lu; device=%s; description=%s\n", problem, id, name);
  }
  SetupDiDestroyDeviceInfoList(devices);
}

int main(int argc, char **argv) {
  const char *ci = std::getenv("GITHUB_ACTIONS");
  const char *repo = std::getenv("GITHUB_REPOSITORY");
  if (argc != 2 || std::strcmp(argv[1], "--ci-vigem-probe") || !ci ||
      std::strcmp(ci, "true") || !repo || std::strcmp(repo, "matheuspergoli/Apollo")) {
    return 2;
  }
  auto client = vigem_alloc();
  if (!client) return 3;
  auto connection = vigem_connect(client);
  std::printf("vigem_connect: 0x%08lx\n", static_cast<unsigned long>(connection));
  if (!VIGEM_SUCCESS(connection)) {
    vigem_free(client);
    return 4;
  }
  auto target = vigem_target_x360_alloc();
  auto addition = target ? vigem_target_add(client, target) : VIGEM_ERROR_INVALID_TARGET;
  std::printf("vigem_target_add: 0x%08lx\n", static_cast<unsigned long>(addition));
  bool added = VIGEM_SUCCESS(addition);
  bool ready = false;
  if (added) {
    XUSB_REPORT report {};
    report.wButtons = XINPUT_GAMEPAD_A;
    auto update = vigem_target_x360_update(client, target, report);
    std::printf("vigem_target_x360_update: 0x%08lx\n", static_cast<unsigned long>(update));
    ready = VIGEM_SUCCESS(update);
    ULONG index = 0;
    VIGEM_ERROR lookup = VIGEM_ERROR_XUSB_USERINDEX_OUT_OF_RANGE;
    DWORD xinput_status = ERROR_DEVICE_NOT_CONNECTED;
    bool xinput_queried = false;
    bool observed = false;
    if (ready) {
      // Bus attachment can finish before Windows binds its XUSB child driver.
      // Require both the assigned player index and the actual report to arrive.
      for (int attempt = 0; attempt < 100; ++attempt) {
        lookup = vigem_target_x360_get_user_index(client, target, &index);
        if (VIGEM_SUCCESS(lookup) && index < 4) {
          XINPUT_STATE state {};
          xinput_status = XInputGetState(index, &state);
          xinput_queried = true;
          if (xinput_status == ERROR_SUCCESS && (state.Gamepad.wButtons & XINPUT_GAMEPAD_A)) {
            observed = true;
            break;
          }
        }
        Sleep(100);
      }
    }
    std::printf("vigem_target_x360_get_user_index: 0x%08lx; index=%lu; XInput queried=%d; status=%lu\n",
                static_cast<unsigned long>(lookup), index, xinput_queried, xinput_status);
    if (!observed) print_pnp_problems();
    ready = ready && observed;
    auto removal = vigem_target_remove(client, target);
    std::printf("vigem_target_remove: 0x%08lx; XInput observed=%d\n", static_cast<unsigned long>(removal), observed);
    ready = VIGEM_SUCCESS(removal) && ready;
  }
  if (target) vigem_target_free(target);
  vigem_disconnect(client);
  vigem_free(client);
  if (!ready) {
    std::fputs("Virtual controller lifecycle or XInput report detection failed.\n", stderr);
    return 5;
  }
  std::puts("Virtual Xbox controller creation, report, XInput index and removal passed.");
  return 0;
}
