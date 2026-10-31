#include "src/config.h"

#include <gtest/gtest.h>

TEST(ConfigBoolean, RecognizesEveryTrueSpellingWithoutCaseSensitivity) {
  for (const auto *value : {"true", "TRUE", "TrUe", "yes", "YES", "Yes", "enable", "ENABLE", "Enable", "enabled", "ENABLED", "Enabled", "on", "ON", "On", "1"}) {
    std::string text(value);
    EXPECT_TRUE(config::to_bool(text)) << value;
  }
}

TEST(ConfigBoolean, PreservesFalseAndLegacyNonBooleanInterpretation) {
  for (const auto *value : {"", "0", "false", "FALSE", "False", "no", "NO", "off", "OFF", "disabled", "DISABLED", "2", "true ", " on", "unknown"}) {
    std::string text(value);
    EXPECT_FALSE(config::to_bool(text)) << value;
  }
  for (const auto *value : {"10", "-1", "abc1xyz"}) {
    std::string text(value);
    EXPECT_TRUE(config::to_bool(text)) << value;
  }
}

TEST(ConfigBoolean, HandlesHighBytesWithoutSignedCharUndefinedBehavior) {
  for (unsigned int byte = 128; byte < 256; ++byte) {
    std::string text(1, static_cast<char>(byte));
    EXPECT_FALSE(config::to_bool(text)) << byte;
  }
}
