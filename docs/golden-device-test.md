# First Golden Apollo device test

Status: preparation, not a ready-to-run distribution.

Golden Windows validation builds two independent matrix jobs: exact upstream
adc5c5a0bd80831ce495434bb16aee2cd4175fb8 and the selected candidate commit.
Both use the same runner/dependency setup. Dependencies are not yet completely
locked, so the result must not be described as a reproducible release.

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
