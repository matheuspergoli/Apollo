<script>
import { goldenOverview } from './golden-overview.mjs';

export default {
  data() {
    return { overview: null, loading: false, error: '', checkedAt: '', controller: null };
  },
  mounted() { this.refresh(); },
  beforeUnmount() { this.controller?.abort(); },
  methods: {
    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.error = '';
      this.overview = null;
      this.controller = new AbortController();
      const timer = setTimeout(() => this.controller.abort(), 8000);
      try {
        const response = await fetch('./api/config', { signal: this.controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sessão expirada. Entre novamente.' : 'Não foi possível consultar o host.');
        this.overview = goldenOverview(await response.json());
        this.checkedAt = new Date().toLocaleTimeString('pt-BR');
      } catch (error) {
        this.error = error.name === 'AbortError' ? 'Consulta interrompida ou host sem resposta.' : error.message;
      } finally {
        clearTimeout(timer);
        this.loading = false;
      }
    },
  },
};
</script>

<template>
  <section class="golden-overview my-4" aria-labelledby="golden-title">
    <header class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <span class="badge text-bg-warning mb-2">Laboratório · Golden Apollo</span>
        <h1 id="golden-title">Seu streaming, sem adivinhação.</h1>
        <p class="text-body-secondary mb-0">RTX 4060 → Galaxy S25+ · alvo 1080p120 · referência AV1/HDR</p>
      </div>
      <button class="btn btn-outline-primary" :disabled="loading" @click="refresh">{{ loading ? 'Consultando…' : 'Atualizar leitura' }}</button>
    </header>

    <p class="small text-body-secondary">Alvo do projeto, não detecção do hardware conectado. Esta página não altera configurações.</p>
    <div role="status" aria-live="polite">
      <p v-if="loading">Lendo configuração do host…</p>
      <p v-else-if="error" class="alert alert-danger">{{ error }}</p>
      <p v-else-if="overview" class="small text-body-secondary">Arquivo consultado às {{ checkedAt }} · Apollo {{ overview.version }}</p>
    </div>

    <div v-if="overview" class="row g-3">
      <article class="col-lg-7">
        <div class="card h-100 p-4">
          <h2 class="h4">Host e display</h2>
          <p class="small text-body-secondary">Valores do arquivo; não comprovam o estado efetivo de uma sessão.</p>
          <dl class="golden-details">
            <dt>Host</dt><dd>{{ overview.host }}</dd>
            <dt>Captura</dt><dd>{{ overview.capture }}</dd>
            <dt>Display</dt><dd>{{ overview.display }}</dd>
            <dt>Adaptador</dt><dd>{{ overview.adapter }}</dd>
            <dt>Fallback</dt><dd>{{ overview.fallback }}</dd>
            <dt>Preset NVENC</dt><dd>{{ overview.preset }}</dd>
            <dt>Driver virtual</dt><dd>{{ overview.driver }} <small>(último estado fornecido pelo host)</small></dd>
          </dl>
          <a href="./config" class="align-self-start">Revisar configurações avançadas →</a>
        </div>
      </article>
      <article class="col-lg-5">
        <div class="card h-100 p-4">
          <h2 class="h4">O que ainda não sabemos</h2>
          <p>Sem telemetria de sessão conectada a este painel.</p>
          <ul class="text-body-secondary">
            <li>Codec, HDR e FPS efetivamente negociados</li>
            <li>Captura, encode e filas em milissegundos</li>
            <li>Decode e apresentação no S25+</li>
            <li>Perda, jitter e rota direta/relay</li>
          </ul>
          <p class="small">Não usamos zero para representar ausência de medição.</p>
          <a href="./troubleshooting#logs">Abrir diagnóstico e logs →</a>
        </div>
      </article>
    </div>

    <aside class="alert alert-secondary mt-3">
      <strong>Experimentos com controle.</strong> Display próprio, refresh elevado e PyroWave ainda não estão integrados nesta versão. O Golden 4.0 continua sendo a referência.
    </aside>
  </section>
</template>

<style scoped>
.golden-overview h1 { font-size: clamp(1.75rem, 4vw, 2.7rem); font-weight: 700; letter-spacing: -.035em; }
.golden-overview .card { border-radius: 1rem; }
.golden-details { display: grid; grid-template-columns: minmax(7rem, 1fr) 2fr; gap: .7rem 1rem; }
.golden-details dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 480px) { .golden-details { grid-template-columns: 1fr; gap: .25rem; } .golden-details dd { margin-bottom: .75rem; } }
</style>
