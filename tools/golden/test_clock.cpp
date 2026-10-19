#include <cassert>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <limits>

#define min(a, b) windows_min_macro_must_not_expand
#define max(a, b) windows_max_macro_must_not_expand
#include "src/platform/windows/clock_math.h"
#undef min
#undef max

int main() {
  using namespace platf::clock_math;
  using limits = std::numeric_limits<std::int64_t>;
  assert(qpc_difference(10'000'000, 0, 10'000'000).count() == 1'000'000'000);
  assert(qpc_difference(31'250, 0, 3'125'000).count() == 10'000'000);
  assert(qpc_difference(0, 31'250, 3'125'000).count() == -10'000'000);
  assert(qpc_difference(5, 0, 3'125'000).count() == 1600);
  assert(qpc_difference(123, 123, 10'000'000).count() == 0);
  assert(qpc_difference(1, 0, 0).count() == 0);
  assert(qpc_difference(1, 0, -1).count() == 0);
  assert(qpc_difference(limits::max(), limits::max() - 1, 10'000'000).count() == 100);
  assert(qpc_difference(limits::min() + 1, limits::min(), 10'000'000).count() == 100);
  assert(qpc_difference(limits::max(), limits::min(), 1).count() == limits::max());
  assert(qpc_difference(limits::min(), limits::max(), 1).count() == limits::min());
  assert(wgc_to_qpc(10'000'000, 10'000'000) == 10'000'000);
  assert(wgc_to_qpc(10'000'000, 3'125'000) == 3'125'000);
  assert(wgc_to_qpc(10'000'000, 24'000'000) == 24'000'000);
  assert(wgc_to_qpc(0, 24'000'000) == 0);
  assert(wgc_to_qpc(-1, 24'000'000) == 0);
  assert(wgc_to_qpc(10, 0) == 0);
  assert(wgc_to_qpc(limits::max(), limits::max()) == limits::max());
  assert(qpc_difference(24'000'000, wgc_to_qpc(9'900'000, 24'000'000), 24'000'000).count() == 10'000'000);
  std::cout << "19 clock assertions passed\n";
}
