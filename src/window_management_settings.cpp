#include "window_management_settings.h"

namespace window_management {
  namespace {
    bool uuid(std::string_view value) {
      if (value.empty()) {
        return true;
      }
      if (value.size() != 36) {
        return false;
      }
      for (std::size_t i = 0; i < value.size(); ++i) {
        const auto c = value[i];
        if (i == 8 || i == 13 || i == 18 || i == 23) {
          if (c != '-') {
            return false;
          }
        } else if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
          return false;
        }
      }
      return true;
    }

    std::optional<bool> boolean(std::string_view value) {
      if (value == "enabled" || value == "true" || value == "1") {
        return true;
      }
      if (value == "disabled" || value == "false" || value == "0") {
        return false;
      }
      return {};
    }
  }  // namespace

  bool apply_setting(settings &options, std::string_view key, std::string_view value) {
    if (key == "wsm_mode") {
      if (value == "disabled") {
        options.policy = mode::disabled;
      } else if (value == "smart") {
        options.policy = mode::smart;
      } else if (value == "automatic") {
        options.policy = mode::automatic;
      } else {
        return false;
      }
      return true;
    }
    if (key == "wsm_application_uuid") {
      if (!uuid(value)) {
        return false;
      }
      options.application_uuid = value;
      return true;
    }
    auto *toggle = key == "wsm_recover_existing"  ? &options.recover_existing :
                   key == "wsm_handle_new"        ? &options.handle_new :
                   key == "wsm_restore_positions" ? &options.restore_positions :
                                                    nullptr;
    const auto parsed = boolean(value);
    if (!toggle || !parsed) {
      return false;
    }
    *toggle = *parsed;
    return true;
  }
}  // namespace window_management
