#pragma once

#include "window_management_policy.h"

#include <string_view>

namespace window_management {
  // Strict persisted settings. Invalid values never silently enable a policy or
  // toggle. Application names/commands are not accepted as identities.
  bool apply_setting(settings &options, std::string_view key, std::string_view value);
}  // namespace window_management
