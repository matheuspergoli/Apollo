const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback;

export function goldenOverview(config) {
  if (!config || config.status !== true) throw new Error('Configuração indisponível');
  const capture = text(config.capture, '');
  const captureNames = { wgc: 'Windows Graphics Capture', ddx: 'Desktop Duplication' };
  const driverNames = {
    0: 'Controle do driver disponível',
    1: 'Estado desconhecido',
    '-1': 'Falha no driver',
    '-2': 'Versão incompatível',
    '-3': 'Falha no watchdog',
  };
  return {
    version: text(config.version, 'Não informado'),
    host: text(config.sunshine_name, 'Nome padrão do host'),
    capture: capture ? (Object.hasOwn(captureNames, capture) ? captureNames[capture] : `Configurado: ${capture}`) : 'Automática (padrão)',
    display: text(config.output_name, 'Seleção automática'),
    adapter: text(config.adapter_name, 'Seleção automática'),
    preset: text(config.nvenc_preset, 'Padrão do Apollo'),
    fallback: text(config.fallback_mode, 'Não informado no arquivo'),
    driver: Object.hasOwn(driverNames, config.vdisplayStatus) ? driverNames[config.vdisplayStatus] : 'Estado não informado',
  };
}
