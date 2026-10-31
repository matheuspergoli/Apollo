/**
 * @file src/input_packet.h
 * @brief Structural validation before input permission checks, batching or dispatch.
 */
#pragma once

#include <bit>
#include <cstdint>
#include <cstring>
#include <span>

extern "C" {
#include <moonlight-common-c/src/Input.h>
}

namespace input {
  template<typename Packet>
  inline bool validate_fixed_input_packet(std::span<const std::uint8_t> packet, std::uint32_t declared_size) {
    return declared_size == sizeof(Packet) - sizeof(std::uint32_t) && packet.size() >= sizeof(Packet);
  }

  /**
   * @brief Validate declared and available bytes using the pinned protocol headers.
   * Unknown events remain structurally valid and are ignored by dispatch as before.
   * Trailing transport bytes are allowed; fixed event declarations remain exact.
   */
  inline bool validate_input_packet(std::span<const std::uint8_t> packet) {
    if (packet.size() < sizeof(NV_INPUT_HEADER)) {
      return false;
    }

    NV_INPUT_HEADER header {};
    std::memcpy(&header, packet.data(), sizeof(header));
    auto declared_size = header.size;
    auto magic = header.magic;
    if constexpr (std::endian::native == std::endian::little) {
      declared_size = std::byteswap(declared_size);
    } else {
      magic = std::byteswap(magic);
    }
    if (declared_size < sizeof(header.magic) || declared_size > packet.size() - sizeof(header.size)) {
      return false;
    }

    switch (magic) {
      case MOUSE_MOVE_REL_MAGIC_GEN5:
        return validate_fixed_input_packet<NV_REL_MOUSE_MOVE_PACKET>(packet, declared_size);
      case MOUSE_MOVE_ABS_MAGIC:
        return validate_fixed_input_packet<NV_ABS_MOUSE_MOVE_PACKET>(packet, declared_size);
      case MOUSE_BUTTON_DOWN_EVENT_MAGIC_GEN5:
      case MOUSE_BUTTON_UP_EVENT_MAGIC_GEN5:
        return validate_fixed_input_packet<NV_MOUSE_BUTTON_PACKET>(packet, declared_size);
      case SCROLL_MAGIC_GEN5:
        return validate_fixed_input_packet<NV_SCROLL_PACKET>(packet, declared_size);
      case SS_HSCROLL_MAGIC:
        return validate_fixed_input_packet<SS_HSCROLL_PACKET>(packet, declared_size);
      case KEY_DOWN_EVENT_MAGIC:
      case KEY_UP_EVENT_MAGIC:
        return validate_fixed_input_packet<NV_KEYBOARD_PACKET>(packet, declared_size);
      case UTF8_TEXT_EVENT_MAGIC:
        return declared_size - sizeof(header.magic) <= UTF8_TEXT_EVENT_MAX_COUNT;
      case MULTI_CONTROLLER_MAGIC_GEN5:
        return validate_fixed_input_packet<NV_MULTI_CONTROLLER_PACKET>(packet, declared_size);
      case SS_TOUCH_MAGIC:
        return validate_fixed_input_packet<SS_TOUCH_PACKET>(packet, declared_size);
      case SS_PEN_MAGIC:
        return validate_fixed_input_packet<SS_PEN_PACKET>(packet, declared_size);
      case SS_CONTROLLER_ARRIVAL_MAGIC:
        return validate_fixed_input_packet<SS_CONTROLLER_ARRIVAL_PACKET>(packet, declared_size);
      case SS_CONTROLLER_TOUCH_MAGIC:
        return validate_fixed_input_packet<SS_CONTROLLER_TOUCH_PACKET>(packet, declared_size);
      case SS_CONTROLLER_MOTION_MAGIC:
        return validate_fixed_input_packet<SS_CONTROLLER_MOTION_PACKET>(packet, declared_size);
      case SS_CONTROLLER_BATTERY_MAGIC:
        return validate_fixed_input_packet<SS_CONTROLLER_BATTERY_PACKET>(packet, declared_size);
      default:
        return true;
    }
  }
}  // namespace input
