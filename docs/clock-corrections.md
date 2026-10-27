# Correções de relógio do Windows (APL-001/002)

Base da investigação: adc5c5a0bd80831ce495434bb16aee2cd4175fb8.
As correções fazem parte da versão 1.0 e possuem regressões no CI Windows.
Corrigem unidades de tempo; não demonstram ganho de desempenho por si só.

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

As regressões exercitam frequências distintas de QPC, deltas negativos, limites
inteiros e timestamps de longa duração; não dependem de um modelo de computador.

Regression command with GCC C++17, -Wall -Wextra -Werror and UBSan:

```
g++ -std=c++17 -Wall -Wextra -Werror -fsanitize=undefined \
  -fno-sanitize-recover=all -I . tools/tests/test_clock.cpp \
  -o build/apollo-clock-test
./build/apollo-clock-test
```

The standalone test is outside tests/ because upstream recursively collects
all test .cpp files into a single GoogleTest executable with its own main.
O CI Windows compila o host e executa essas regressões usando GCC/MSYS2.
Isso não equivale a validar outra toolchain, como MSVC.

## Sources

- https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps
- https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.direct3d11captureframe.systemrelativetime
- Vibepollo 4b2942efdf23e905c9d419a14ab5df00d1ddddb6,
  src/platform/windows/wgc_capture_policy.h:95–112, used as a research lead.

The implementation follows the documented time-unit relationships. No driver,
refresh, NVENC preset, network or client behavior was changed.

## Limites da validação

A compilação nativa e os ensaios de streaming do usuário são evidências distintas.
O usuário confirmou sessões reais; não foi feito um benchmark controlado de
latência ou comparação de desempenho entre backends DXGI e WGC.
