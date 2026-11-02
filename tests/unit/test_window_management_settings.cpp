#include "src/window_management_settings.h"

#include <gtest/gtest.h>

namespace wm = window_management;

TEST(WindowManagementSettings, RequiresExplicitUuidAndStrictRecognizedPolicy) {
  wm::settings options;
  EXPECT_TRUE(options.application_uuid.empty());
  EXPECT_TRUE(wm::apply_setting(options, "wsm_mode", "disabled"));
  EXPECT_EQ(options.policy, wm::mode::disabled);
  for (const auto *invalid : {"", "enabled", "automatic1", "Automatic", "smart\n", "true"}) {
    EXPECT_FALSE(wm::apply_setting(options, "wsm_mode", invalid));
    EXPECT_EQ(options.policy, wm::mode::disabled);
  }
  EXPECT_TRUE(wm::apply_setting(options, "wsm_mode", "automatic"));
  EXPECT_EQ(options.policy, wm::mode::automatic);
  EXPECT_TRUE(wm::apply_setting(options, "wsm_mode", "smart"));
  EXPECT_EQ(options.policy, wm::mode::smart);
}

TEST(WindowManagementSettings, InvalidBooleansCannotEnableRecoveryOrRestoration) {
  wm::settings options;
  for (const auto *key : {"wsm_recover_existing", "wsm_handle_new", "wsm_restore_positions"}) {
    for (const auto *value : {"disabled", "false", "0"}) {
      EXPECT_TRUE(wm::apply_setting(options, key, value));
    }
    for (const auto *value : {"", "enable1", "yes", "TRUE", "-1", "1\n"}) {
      EXPECT_FALSE(wm::apply_setting(options, key, value));
    }
  }
  EXPECT_FALSE(options.recover_existing);
  EXPECT_FALSE(options.handle_new);
  EXPECT_FALSE(options.restore_positions);
  for (const auto *key : {"wsm_recover_existing", "wsm_handle_new", "wsm_restore_positions"}) {
    for (const auto *value : {"enabled", "true", "1"}) {
      EXPECT_TRUE(wm::apply_setting(options, key, value));
    }
  }
  EXPECT_TRUE(options.recover_existing);
  EXPECT_TRUE(options.handle_new);
  EXPECT_TRUE(options.restore_positions);
}

TEST(WindowManagementSettings, NamesCommandsMalformedIdentitiesAndUnknownKeysAreRejected) {
  wm::settings options;
  const std::string identity = "12345678-abcd-4321-9876-1234567890ab";
  ASSERT_TRUE(wm::apply_setting(options, "wsm_application_uuid", identity));
  for (const auto *invalid : {"Desktop", "cmd.exe", "{12345678-abcd-4321-9876-1234567890ab}", "12345678-abcd-4321-9876-1234567890ag", "12345678_abcd-4321-9876-1234567890ab"}) {
    EXPECT_FALSE(wm::apply_setting(options, "wsm_application_uuid", invalid));
    EXPECT_EQ(options.application_uuid, identity);
  }
  EXPECT_FALSE(wm::apply_setting(options, "wsm_unknown", "enabled"));
  EXPECT_TRUE(wm::apply_setting(options, "wsm_application_uuid", ""));
  EXPECT_TRUE(options.application_uuid.empty());
}
