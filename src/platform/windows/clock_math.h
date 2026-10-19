#pragma once

#include <chrono>
#include <cstdint>
#include <limits>

namespace platf::clock_math {
  inline std::int64_t saturating_integer(long double value) {
    if (value >= static_cast<long double>((std::numeric_limits<std::int64_t>::max)())) {
      return (std::numeric_limits<std::int64_t>::max)();
    }
    if (value <= static_cast<long double>((std::numeric_limits<std::int64_t>::min)())) {
      return (std::numeric_limits<std::int64_t>::min)();
    }
    return static_cast<std::int64_t>(value);
  }

  inline std::chrono::nanoseconds qpc_difference(std::int64_t end, std::int64_t start, std::int64_t frequency) {
    if (frequency <= 0) {
      return {};
    }
    // Subtract integers first when possible, preserving short intervals after long uptimes.
    const auto delta = (end >= 0 && start >= 0) || (end < 0 && start < 0) ?
                         static_cast<long double>(end - start) :
                         static_cast<long double>(end) - static_cast<long double>(start);
    return std::chrono::nanoseconds(saturating_integer(delta * 1'000'000'000.0L / frequency));
  }

  inline std::int64_t wgc_to_qpc(std::int64_t hundred_ns, std::int64_t frequency) {
    if (hundred_ns <= 0 || frequency <= 0) {
      return 0;
    }
    if (frequency == 10'000'000) {
      return hundred_ns;
    }
    return saturating_integer(static_cast<long double>(hundred_ns) * frequency / 10'000'000.0L);
  }
}
