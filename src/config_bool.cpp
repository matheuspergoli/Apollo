/**
 * @file src/config_bool.cpp
 * @brief Legacy configuration boolean parsing shared by native consumers.
 */
#include "config.h"

#include <algorithm>
#include <cctype>

namespace config {
  bool to_bool(std::string &boolean) {
    std::transform(boolean.begin(), boolean.end(), boolean.begin(), [](unsigned char ch) {
      return static_cast<char>(std::tolower(ch));
    });

    return boolean == "true" ||
           boolean == "yes" ||
           boolean == "enable" ||
           boolean == "enabled" ||
           boolean == "on" ||
           boolean.find('1') != std::string::npos;
  }
}  // namespace config
