#include <windows.h>
#include <xinput.h>
#include <ViGEm/Client.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>

int main(int argc, char **argv) {
  const char *ci = std::getenv("GITHUB_ACTIONS");
  const char *repo = std::getenv("GITHUB_REPOSITORY");
  if (argc != 2 || std::strcmp(argv[1], "--ci-vigem-probe") || !ci ||
      std::strcmp(ci, "true") || !repo || std::strcmp(repo, "matheuspergoli/Apollo")) {
    return 2;
  }
  auto client = vigem_alloc();
  if (!client) return 3;
  if (!VIGEM_SUCCESS(vigem_connect(client))) {
    vigem_free(client);
    return 4;
  }
  auto target = vigem_target_x360_alloc();
  bool added = target && VIGEM_SUCCESS(vigem_target_add(client, target));
  bool ready = false;
  if (added) {
    XUSB_REPORT report {};
    report.wButtons = XINPUT_GAMEPAD_A;
    ready = VIGEM_SUCCESS(vigem_target_x360_update(client, target, report));
    ULONG index = 0;
    ready = ready && VIGEM_SUCCESS(vigem_target_x360_get_user_index(client, target, &index)) && index < 4;
    bool observed = false;
    if (ready) {
      for (int attempt = 0; attempt < 50; ++attempt) {
        XINPUT_STATE state {};
        if (XInputGetState(index, &state) == ERROR_SUCCESS && (state.Gamepad.wButtons & XINPUT_GAMEPAD_A)) {
          observed = true;
          break;
        }
        Sleep(100);
      }
    }
    ready = ready && observed;
    ready = VIGEM_SUCCESS(vigem_target_remove(client, target)) && ready;
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
