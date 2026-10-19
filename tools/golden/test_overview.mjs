import test from 'node:test';
import assert from 'node:assert/strict';
import { goldenOverview } from '../../src_assets/common/assets/web/golden-overview.mjs';

test('missing or rejected responses are not represented as a healthy host', () => {
  for (const config of [null, undefined, {}, { status: false }, { status: 'true' }]) {
    assert.throws(() => goldenOverview(config));
  }
});
test('omitted settings remain defaults, not detected hardware or telemetry', () => {
  const result = goldenOverview({ status: true });
  assert.equal(result.capture, 'Automática (padrão)');
  assert.equal(result.adapter, 'Seleção automática');
  assert.equal(result.driver, 'Estado não informado');
  assert.equal('latency' in result, false);
});
test('file values are preserved without interpreting them as session state', () => {
  const result = goldenOverview({ status: true, capture: 'wgc', nvenc_preset: '1', fallback_mode: '1920x1080x120', vdisplayStatus: 0 });
  assert.equal(result.capture, 'Windows Graphics Capture');
  assert.equal(result.preset, '1');
  assert.equal(result.fallback, '1920x1080x120');
  assert.equal(result.driver, 'Controle do driver disponível');
});
test('failure statuses never imply a working driver', () => {
  for (const status of [-1, -2, -3, 1, 999]) {
    assert.notEqual(goldenOverview({ status: true, vdisplayStatus: status }).driver, 'Controle do driver disponível');
  }
});
test('unknown capture values and invalid field types remain explicit', () => {
  assert.equal(goldenOverview({ status: true, capture: 'future' }).capture, 'Configurado: future');
  assert.equal(goldenOverview({ status: true, adapter_name: {}, version: 42 }).version, 'Não informado');
  assert.equal(goldenOverview({ status: true, capture: '__proto__', vdisplayStatus: '__proto__' }).driver, 'Estado não informado');
});
