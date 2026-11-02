#include "src/input_packet.h"

#include <algorithm>
#include <array>
#include <gtest/gtest.h>
#include <limits>
#include <vector>

namespace {
  // Write the wire format independently of the production endian conversion.
  std::vector<std::uint8_t> packet(std::uint32_t magic, std::uint32_t declared, std::size_t available) {
    std::vector<std::uint8_t> bytes(available);
    const std::array<std::uint8_t, 8> header {
      static_cast<std::uint8_t>(declared >> 24),
      static_cast<std::uint8_t>(declared >> 16),
      static_cast<std::uint8_t>(declared >> 8),
      static_cast<std::uint8_t>(declared),
      static_cast<std::uint8_t>(magic),
      static_cast<std::uint8_t>(magic >> 8),
      static_cast<std::uint8_t>(magic >> 16),
      static_cast<std::uint8_t>(magic >> 24)
    };
    std::copy_n(header.begin(), std::min(bytes.size(), header.size()), bytes.begin());
    return bytes;
  }

  struct Event {
    std::uint32_t magic;
    std::size_t size;
  };

  constexpr Event fixed_events[] {
    {MOUSE_MOVE_REL_MAGIC_GEN5, sizeof(NV_REL_MOUSE_MOVE_PACKET)},
    {MOUSE_MOVE_ABS_MAGIC, sizeof(NV_ABS_MOUSE_MOVE_PACKET)},
    {MOUSE_BUTTON_DOWN_EVENT_MAGIC_GEN5, sizeof(NV_MOUSE_BUTTON_PACKET)},
    {MOUSE_BUTTON_UP_EVENT_MAGIC_GEN5, sizeof(NV_MOUSE_BUTTON_PACKET)},
    {SCROLL_MAGIC_GEN5, sizeof(NV_SCROLL_PACKET)},
    {SS_HSCROLL_MAGIC, sizeof(SS_HSCROLL_PACKET)},
    {KEY_DOWN_EVENT_MAGIC, sizeof(NV_KEYBOARD_PACKET)},
    {KEY_UP_EVENT_MAGIC, sizeof(NV_KEYBOARD_PACKET)},
    {MULTI_CONTROLLER_MAGIC_GEN5, sizeof(NV_MULTI_CONTROLLER_PACKET)},
    {SS_TOUCH_MAGIC, sizeof(SS_TOUCH_PACKET)},
    {SS_PEN_MAGIC, sizeof(SS_PEN_PACKET)},
    {SS_CONTROLLER_ARRIVAL_MAGIC, sizeof(SS_CONTROLLER_ARRIVAL_PACKET)},
    {SS_CONTROLLER_TOUCH_MAGIC, sizeof(SS_CONTROLLER_TOUCH_PACKET)},
    {SS_CONTROLLER_MOTION_MAGIC, sizeof(SS_CONTROLLER_MOTION_PACKET)},
    {SS_CONTROLLER_BATTERY_MAGIC, sizeof(SS_CONTROLLER_BATTERY_PACKET)}
  };
}  // namespace

TEST(InputPacket, RejectsEveryTruncatedHeader) {
  for (std::size_t size = 0; size < sizeof(NV_INPUT_HEADER); ++size) {
    EXPECT_FALSE(input::validate_input_packet(packet(KEY_DOWN_EVENT_MAGIC, 10, size))) << size;
  }
}

TEST(InputPacket, FixedEventsRequireCompleteBytesAndExactDeclarations) {
  for (const auto &event : fixed_events) {
    SCOPED_TRACE(event.magic);
    auto declared = static_cast<std::uint32_t>(event.size - 4);
    EXPECT_TRUE(input::validate_input_packet(packet(event.magic, declared, event.size)));
    EXPECT_TRUE(input::validate_input_packet(packet(event.magic, declared, event.size + 16)));
    for (std::size_t size = 0; size < event.size; ++size) {
      EXPECT_FALSE(input::validate_input_packet(packet(event.magic, declared, size))) << size;
    }
    EXPECT_FALSE(input::validate_input_packet(packet(event.magic, declared - 1, event.size)));
    EXPECT_FALSE(input::validate_input_packet(packet(event.magic, declared + 1, event.size + 1)));
    EXPECT_FALSE(input::validate_input_packet(packet(event.magic, 0, event.size)));
    EXPECT_FALSE(input::validate_input_packet(packet(event.magic, std::numeric_limits<std::uint32_t>::max(), event.size)));
  }
}

TEST(InputPacket, UnicodeRequiresBoundedDeclaredTextInsideAvailableBytes) {
  for (std::uint32_t count = 0; count <= UTF8_TEXT_EVENT_MAX_COUNT; ++count) {
    auto bytes = packet(UTF8_TEXT_EVENT_MAGIC, 4 + count, 8 + count);
    EXPECT_TRUE(input::validate_input_packet(bytes)) << count;
    bytes.pop_back();
    EXPECT_FALSE(input::validate_input_packet(bytes)) << count;
  }
  EXPECT_FALSE(input::validate_input_packet(packet(UTF8_TEXT_EVENT_MAGIC, 3, 8)));
  EXPECT_FALSE(input::validate_input_packet(packet(UTF8_TEXT_EVENT_MAGIC, 4 + UTF8_TEXT_EVENT_MAX_COUNT + 1, 8 + UTF8_TEXT_EVENT_MAX_COUNT + 1)));
  EXPECT_FALSE(input::validate_input_packet(packet(UTF8_TEXT_EVENT_MAGIC, 0xffffffff, 40)));
  EXPECT_TRUE(input::validate_input_packet(packet(UTF8_TEXT_EVENT_MAGIC, 5, 40)));
}

TEST(InputPacket, UnknownEventsStillRequireAStructurallyValidHeader) {
  EXPECT_TRUE(input::validate_input_packet(packet(0x7fffffff, 4, 8)));
  EXPECT_FALSE(input::validate_input_packet(packet(0x7fffffff, 3, 8)));
  EXPECT_FALSE(input::validate_input_packet(packet(0x7fffffff, 5, 8)));
}

TEST(InputPacket, UnalignedWireStorageIsAcceptedWithoutMutation) {
  auto bytes = packet(KEY_DOWN_EVENT_MAGIC, sizeof(NV_KEYBOARD_PACKET) - 4, sizeof(NV_KEYBOARD_PACKET));
  bytes.insert(bytes.begin(), 0xff);
  const auto original = bytes;
  EXPECT_TRUE(input::validate_input_packet(std::span<const std::uint8_t>(bytes).subspan(1)));
  EXPECT_EQ(bytes, original);
}

TEST(InputPacket, OnlyStructurallyValidDesktopEventsGrantSmartActivityEvidence) {
  for (const auto &event : fixed_events) {
    const bool desktop = event.magic != MULTI_CONTROLLER_MAGIC_GEN5 &&
                         event.magic != SS_CONTROLLER_ARRIVAL_MAGIC && event.magic != SS_CONTROLLER_TOUCH_MAGIC &&
                         event.magic != SS_CONTROLLER_MOTION_MAGIC && event.magic != SS_CONTROLLER_BATTERY_MAGIC;
    auto bytes = packet(event.magic, event.size - 4, event.size);
    EXPECT_EQ(input::desktop_input_activity(bytes), desktop) << event.magic;
    bytes.pop_back();
    EXPECT_FALSE(input::desktop_input_activity(bytes)) << event.magic;
  }
  EXPECT_FALSE(input::desktop_input_activity(packet(0x7fffffff, 4, 8)));
  EXPECT_TRUE(input::desktop_input_activity(packet(UTF8_TEXT_EVENT_MAGIC, 5, 9)));
}
