#include <gtest/gtest.h>
#include "../../src/platform/windows/virtual_display_policy.h"

TEST(VirtualDisplayPolicy, PhysicalCaptureDoesNotRequireVirtualDriver) {
  EXPECT_FALSE(VDISPLAY::virtual_target_required(false, false, false, false));
}

TEST(VirtualDisplayPolicy, EveryExplicitOrHeadlessRequestRequiresVirtualTarget) {
  for (int mask = 1; mask < 16; ++mask) {
    EXPECT_TRUE(VDISPLAY::virtual_target_required(mask & 1, mask & 2, mask & 4, mask & 8));
  }
}

TEST(VirtualDisplayPolicy, MissingDriverOrUnknownTargetCannotBeTreatedAsUsable) {
  EXPECT_FALSE(VDISPLAY::virtual_target_usable(false, false));
  EXPECT_FALSE(VDISPLAY::virtual_target_usable(false, true));
  EXPECT_FALSE(VDISPLAY::virtual_target_usable(true, false));
  EXPECT_TRUE(VDISPLAY::virtual_target_usable(true, true));
}
