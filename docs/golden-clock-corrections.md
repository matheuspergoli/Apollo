# Golden clock correctness candidate (APL-001/002)

Base: adc5c5a0bd80831ce495434bb16aee2cd4175fb8. Local experimental branch;
not installed, not Windows-build validated, no performance improvement claimed.

## Findings

`qpc_time_difference` multiplied ticks by frequency / 1e9. The correct
nanosecond conversion is ticks * 1e9 / frequency. All current callers in
display_ram.cpp, display_vram.cpp and display_wgc.cpp derive frame timestamps
from this helper. At 10 MHz, a 10 ms difference became 1000 ns instead of
10,000,000 ns. This is a timestamp correctness issue, not a measured reduction
in capture latency.

WGC SystemRelativeTime is a WinRT TimeSpan (100 ns units) on the QPC timebase,
not necessarily a count of raw QPC ticks. Convert it before passing it to the
shared difference helper. QueryPerformanceFrequency is cached once.

The conversion policy is independent of Windows headers for host tests.
Same-sign counters are subtracted as integers before conversion to preserve
small deltas after long uptimes. Opposite-sign extremes avoid signed overflow;
results saturate before integer casts. Invalid frequencies return zero.

## Evidence and tests

Read-only Windows probe on 19 October 2026 using System.Diagnostics.Stopwatch:
frequency 10,000,000; high resolution true; OSVersion 10.0.26300.0.
This OS build differs from the older Golden snapshot and should not be silently
replaced by that snapshot's value in future diagnostics.

19 assertions passed with GCC C++17, -Wall -Wextra -Werror and UBSan:

```
g++ -std=c++17 -Wall -Wextra -Werror -fsanitize=undefined \
  -fno-sanitize-recover=all -I . tools/tests/test_clock.cpp \
  -o /tmp/opencode/apollo-clock-test
/tmp/opencode/apollo-clock-test
```

The standalone test is outside tests/ because upstream recursively collects
all test .cpp files into a single GoogleTest executable with its own main.
Windows API integration and MSVC behavior still require a native build/test.

## Sources

- https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps
- https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.direct3d11captureframe.systemrelativetime
- Vibepollo 4b2942efdf23e905c9d419a14ab5df00d1ddddb6,
  src/platform/windows/wgc_capture_policy.h:95–112, used as a research lead.

Implementation here was written independently from the documented unit
relationships. Context7 was unavailable; Microsoft documentation was fetched
directly. No driver, refresh, NVENC preset, network or client behavior was changed.

## Acceptance before promotion

Native Windows compile, smoke tests in DXGI and WGC, SDR and HDR captures,
timestamp sanity against QPC and comparison of client pacing/host statistics.
Keep the exact upstream baseline for A/B. A successful arithmetic test is not
a successful stream test.
