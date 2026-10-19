# First Golden Apollo device test

Status: experimental manual test packages prepared; streaming not yet validated.

## First local test packages

Run 39317972369 passed both native builds, CPack and artifact upload. Candidate
clock and dashboard tests also passed on Windows. Downloaded original ZIP
checksums were checked before creating service/driver-installer-free packages.

Local output directory:
`C:\Users\heizw\Downloads\Golden-Apollo-Teste-39317972369`.

- Candidate ZIP SHA256:
  `950d2de6338405bc7b6fb8bbae509c456d1b50f9e2b00997425e87425d360640`
- Control ZIP SHA256:
  `268fafe5a723ff769f72a7c4f8e2faaae5b2753ade5180cba9700ea2c7714f13`

`tools/golden/package_lab.py` retains only sunshine.exe, zlib1.dll and assets
from upstream packaging, then adds project license/notice, local metadata,
hashes, README, isolated config and an explicit manual launcher. No service
helper, driver binaries/installers, migration or firewall scripts are shipped
in these derived ZIPs. Packaging scripts live in Git for inspection.

Both extracted executables passed `--version` on the user's Windows with exit
code 0; ApolloService was Running before and after each probe. This command
returns before platform display/NVIDIA initialization. It does not establish
that a full host/session will work. Launcher PowerShell parsing had zero errors;
its full launch path and refusal paths have not been runtime tested.

Run the supplied CMD, not sunshine.exe directly. It refuses when the original
service or another sunshine.exe is running and checks the intended port block.
It never automatically stops/restarts the original. An explicit TESTAR prompt
precedes full host initialization. ExecutionPolicy Bypass is scoped to that
PowerShell process; no machine policy is changed. This is not permission to
disable Defender/SmartScreen or bypass a security warning blindly.

Normal host initialization may adjust shared NVIDIA preferences and display
state. Alternate hosts and keep local access for recovery. The launcher and
README do not claim complete sandboxing. No full host launch or stream has
been performed by the agent. User-controlled test and restoration are pending.

Golden Windows validation builds two independent matrix jobs: exact upstream
adc5c5a0bd80831ce495434bb16aee2cd4175fb8 and the selected candidate commit.
Both use the same runner/dependency setup. Dependencies are not yet completely
locked, so the result must not be described as a reproducible release.

First run 39314150648 failed in BOTH builds: video.cpp's AMF H.264 option
referenced config_t.profile, which does not exist. Compatibility commit
fcba3f6b74bca3bcbc5c51546073df7b917d2997 replaces that unfinished selection with
its high-profile fallback. This affects the AMD AMF option, not native NVENC.
The same patch is applied to the baseline by the workflow: it is now an
upstream-plus-build-fix control, NOT byte-for-byte unmodified upstream.
Future AMF baseline/main profile support requires proper negotiation plumbing;
this patch does not claim to implement it. The candidate clock assertions and
overview model tests passed on the native Windows runner before the build failed.

Artifacts are explicitly named unvalidated. Upstream ZIP packaging includes
service/driver scripts that must not be run on the production host. A ZIP from
this workflow is an engineering input, not the final safe laboratory package.
No installer will be offered until its production-impacting hooks are removed.

## Release gate for a user-facing test ZIP

1. Native candidate and matching control compile successfully.
2. Resolve runtime DLLs/assets and inspect packaged contents.
3. Provide an explicit manual launcher bypassing production service management,
   separate config/state/certificates and a nonconflicting port block.
4. No included automatic service/driver/firewall installer; no autostart.
5. Confirm manual start does not stop, restart or reconfigure ApolloService.
6. Document intentional user-controlled alternation for streaming tests: two
   hosts must not operate the same virtual display concurrently.

## User test after those gates

- Preserve the existing Apollo and its original Artemis host entry.
- Record a short original session: same game/scene, 1080p120, codec, HDR,
  bitrate, connection and game frame cap. Capture Artemis statistics.
- End the stream. Alternate hosts using the documented manual process.
- Pair a NEW Artemis host entry with the lab host; original pairing stays intact.
- Repeat the same scene/settings with the candidate and matching control.
- Record stutter/drops, reported processing/network times, visual quality and
  recovery. Repeat, alternate order and include a sustained session.
- End lab stream/host and restore original streaming availability. Validate
  TV/NanoKVM and virtual display recovery.

First candidate contains clock correctness fixes and the read-only dashboard.
It does not contain the Vibepollo display driver or PyroWave. Those require
separate experiments, packaging/security work and, for PyroWave, a compatible
client. A successful arithmetic test cannot replace device validation.
