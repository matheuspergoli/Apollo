# Roadmap e evidências do host Windows

Visão de evolução, não lista de funcionalidades prometidas. “Golden” é o nome de
trabalho do estudo; a distribuição continua Apollo. A baseline publicada é a
[1.0.2](releases/v1.0.2.md), commit `ed3b23951c5e26942ba1675d4993e21ff468f39a`.

Leia a [arquitetura](architecture.md), a [decisão 0001](adr/0001-host-first-and-evidence.md)
e o [método de validação](development.md#baseline-e-medição-do-host) antes de propor
implementação. Escopo ativo: host Windows, Artemis e protocolo preservados.

## Como manter o track

- **Existente:** localizado no código; não significa benchmark ou teste de hardware.
- **Parcial:** alguma base existe, mas o resultado pretendido não está qualificado.
- **Investigar:** hipótese; requer pergunta, evidência e critério de saída.
- **Em espera:** fora do trabalho ativo, sem dependência criada no produto.
- **Fechado no recorte:** levantamento concluído para os caminhos e snapshots
  declarados; não significa auditoria integral ou dispensa de futuras revisões.

Cada mudança aponta um ID abaixo e registra no PR problema, fonte/commit, alternativa
mais simples, contrato do Apollo, riscos, regressão e evidência resultante. Atualize
o status e os links aqui; não crie um relatório permanente por sessão ou tentativa.
Uma issue externa orienta investigação, não comprova defeito ou correção neste fork.

## Inventário inicial de fontes

São o fork e três upstreams, quatro repositórios. Os snapshots abaixo fixam a consulta;
não são todos bases de merge nem uma afirmação de que seus patches foram integrados.

| Fonte | Referência | Papel e limite |
| --- | --- | --- |
| Este Apollo | [`ed3b2395`](https://github.com/matheuspergoli/Apollo/tree/ed3b23951c5e26942ba1675d4993e21ff468f39a) | Release 1.0.2; configuração, pacote e contratos do fork |
| Apollo original | [`adc5c5a0`](https://github.com/ClassicOldSong/Apollo/tree/adc5c5a0bd80831ce495434bb16aee2cd4175fb8) | Ancestral comum identificado localmente com `origin/master`; preservar comportamento herdado relevante |
| Sunshine | [`d0b4a88e`](https://github.com/LizardByte/Sunshine/tree/d0b4a88ef727f8dabf80cc970a14739b55c885de) | Referência para correções de protocolo, captura e encoder; diff semântico integral ainda pendente |
| Vibepollo | [`4afd9daf`](https://github.com/Nonary/Vibepollo/tree/4afd9daf5813c700942e07b87b398ea51801abd1) | Hipóteses e implementações a avaliar, não um port planejado; distinguir forks homônimos |

O contrato de runtime fixa separadamente os hashes dos binários distribuídos.
Entre as dependências versionadas do código de referência estão libdisplaydevice
`f31e46d8736fa6932d34c1417111e60ca507b29f`, build-deps
`a9a7f86328963837e30e21c8901faba00fe81542`, ViGEmClient
`8d71f6740ffff4671cdadbca255ce528e3cd3fef` e nv-codec-headers
`22441b505d9d9afc1e3002290820909846c24bdc`. Isso não substitui identificar as
versões efetivamente vinculadas de FFmpeg e outros binários ao avaliar uma integração.

### Fechamento do recorte inicial G01

Inventário estático dos caminhos WGC, NVENC, reversão de display e dos inputs do
build Windows da 1.0.2. Não é um diff integral dos upstreams nem um SBOM completo.
Os snapshots da tabela continuam fixos; um HEAD posterior exige nova avaliação.

**Divergências próprias contra o Apollo original:** `src/stream.cpp`,
`src/stat_trackers.h`, `src/logging.h`, `src/display_device.cpp`, `src/nvenc/` e
`tools/sunshinesvc.cpp` não diferem no recorte da release. As alterações próprias
relevantes são conversões de relógio, confirmação/reinício HTTP e supervisão,
política de display virtual fail-closed, administração e distribuição.
`src/video.cpp` também remove caminhos macOS e fixa o perfil AMF H.264 em `high`:
[a correção `fcba3f6b`](https://github.com/matheuspergoli/Apollo/commit/fcba3f6b74bca3bcbc5c51546073df7b917d2997)
retirou a referência a um campo `config_t::profile` inexistente. Não classificar
todas as diferenças desse arquivo como otimizações ou mudanças apenas de macOS.

| Recorte | Diferença verificada | Decisão inicial |
| --- | --- | --- |
| WGC / Sunshine | Mailbox latest-wins em ambos; intervalo solicitado difere. O snapshot Sunshine usa `.count()` diretamente onde o Apollo preserva a conversão TimeSpan→QPC | Não transplantar o arquivo nem reintroduzir a interpretação errada de unidades; comparar intervalos só com baseline |
| NVENC / espera de evento | Encode assíncrono e espera já existem. Apollo reduz todo retorno diferente de sucesso a `false` e o chamador reporta timeout | Candidato localizado de diagnóstico; não é correção de freeze reproduzido nem ganho de performance |
| NVENC / versões de SDK | Sunshine compila/seleciona variantes de SDK; Vibepollo usa outra estratégia de negociação de versões | Não atualizar headers ou copiar `nvenc_base.cpp` isoladamente; dependências e matriz de drivers/codecs tornam isso outra migração |
| Reversão / libdisplaydevice | Sunshine conserva recuperação parcial para dispositivos ausentes com outra semântica de persistência da biblioteca | Investigar conjunto host+biblioteca. O observador sozinho não acrescenta a capacidade nem resolve ownership/orçamento |
| WGC / Vibepollo | Helper, IPC e textura compartilhada alteram captura, sincronização, conversão e ciclo de vida | Não transplantar; não equivale a remover uma cópia ou ligar uma flag |

Referências precisas para reabrir cada decisão:

- [Sunshine `adb443f0`, PR #4424](https://github.com/LizardByte/Sunshine/commit/adb443f0d1d83f203240860869212fed924c4348):
  pedido de intervalo WGC, não prova de frequência entregue no Apollo.
- [Vibepollo `15185c36`](https://github.com/Nonary/Vibepollo/commit/15185c363bfeaec956a4432778274d8e29ab7b40):
  classifica a espera NVENC. Uma eventual adaptação deve preservar sucesso e prazo
  de 100 ms, capturar erro apenas em `WAIT_FAILED` e imediatamente, distinguir resultado
  inesperado e testar o caminho do Apollo. Não importar uma nova interface auxiliar
  apenas porque o patch de origem a utiliza.
- [Sunshine `fb3d85cf`, PR #5451](https://github.com/LizardByte/Sunshine/commit/fb3d85cff4698c3e3aaa1be6861abf45a0ed1f1d):
  evolução de SDK NVENC atravessa build, factory, conversão e chamadores.
- [Sunshine `e9b24114`, PR #5625](https://github.com/LizardByte/Sunshine/commit/e9b24114c209b514ba7c4fd4eccfdfa1ae6e9235):
  reversão parcial depende também da mudança de libdisplaydevice, de
  `f31e46d8` para uma implementação como `a2afc0430d44223c25a2ebc598000f78b338aa52`.
  O scheduler ainda precisa de análise de prazo e cancelamento.
- [Vibepollo `2a47cb27`](https://github.com/Nonary/Vibepollo/commit/2a47cb2769e6263487e84d4b3acd0392b93eabe8):
  caminho WGC direto com IPC e ownership de textura; não um patch de cópia isolado.

### Inputs do build, versões e limites de identificação

`cmake/dependencies/common.cmake` seleciona bibliotecas estáticas de
`third-party/build-deps/dist/Windows-AMD64` no caminho usado pelo workflow da release.
No snapshot `a9a7f863`, os metadados entregues junto às bibliotecas declaram:

| Input | Versão declarada / evidência |
| --- | --- |
| FFmpeg | `libavutil/ffversion.h`: `6400860`; não converter esse identificador em uma release presumida |
| libavcodec / libavutil / libswscale | `.pc`: `61.19.101` / `59.39.100` / `8.3.100` |
| SVT-AV1 / x265 | `.pc`: `3.0.2` / `4.1`; header x265 declara build `215` |
| x264 | `x264_config.h`: `0.165.x`, com `X264_VERSION` vazio; commit exato não identificado por esses campos |
| libcbs | `.pc` declara `0.0.0`; insuficiente para identificar uma versão upstream |
| NVENC headers | `src/nvenc/nvenc_base.cpp` exige SDK/API `12.0`; não é a versão do driver gráfico do usuário |
| Toolchain / OpenSSL | Log de configuração da release: GNU `16.2.0`, OpenSSL encontrado `3.6.5` |
| SudoVDA / instalador ViGEmBus | Contrato de runtime: driver `1.10.9.289`; instalador de fornecedor `1.21.442`, com hashes fixados |

Fonte: [build-deps no snapshot fixado](https://github.com/LizardByte/build-deps/tree/a9a7f86328963837e30e21c8901faba00fe81542/dist/Windows-AMD64).
Isso documenta inputs de build, não executa funções de versão das bibliotecas.
A inspeção estática de imports do `sunshine.exe` publicado não lista DLLs FFmpeg
ou OpenSSL, mas não enumera carregamentos tardios por `LoadLibrary` nem prova todos
os objetos vinculados. O driver NVENC é fornecido pelo Windows/driver gráfico do
host, não por esses headers. Não usar o `ffmpeg` instalado em outra máquina como
identidade da biblioteca desta release.

**Resultado G01:** recorte inicial fechado com fontes, diferenças, inputs e lacunas
identificados. Nenhum patch foi importado. Identificação completa de fontes de
bibliotecas pré-compiladas, revisão de vulnerabilidades e matrizes de compatibilidade
continuam exigências específicas de uma futura atualização de dependência.

### Evidências que mudam o plano

| Constatação | Evidência | Consequência |
| --- | --- | --- |
| Pedido de atualização WGC acima de 60 Hz já existe | `wgc_capture_t::init` e [Sunshine #4424](https://github.com/LizardByte/Sunshine/pull/4424), merged em 2025-11-17 | Medir a entrega real, não reimplementar a chamada |
| Mailbox WGC já substitui o frame pendente | `on_frame_arrived` e `next_frame` | Investigar residência e substituições; não adicionar outra mailbox equivalente |
| Há métricas herdadas, com semânticas diferentes | `videoBroadcastThread`, `src/logging.h`, `src/stat_trackers.h` | Definir população e clocks antes de acrescentar percentis ou gráficos |
| Restauração já existe e pode permanecer agendada sem prazo global | `revert_configuration_unlocked`, `src/process.cpp` | Investigar ownership, cancelamento e limites; não partir do zero |
| WGC e display podem falhar em conjunto | [Vibepollo #454](https://github.com/Nonary/Vibepollo/issues/454), relato de captura muito baixa e frequência divergente | Caso para matriz futura; não benchmark do Apollo nem causa comprovada aqui |
| Recuperação pode conflitar com uso local | [Vibepollo #653](https://github.com/Nonary/Vibepollo/issues/653) | Mudança manual e hotplug precisam de cenários explícitos |
| Há relato de reversão prolongada após desconexão | [Sunshine #5870](https://github.com/LizardByte/Sunshine/issues/5870) | Investigar o caminho local correspondente antes de selecionar uma correção |
| Prioridade NVENC/HAGS depende da carga | [Sunshine #5956](https://github.com/LizardByte/Sunshine/issues/5956) | A observação de HAGS é parte de um relato cujo sintoma principal envolve apresentação Android; não explica todo stutter nem recomenda alterar o Windows |
| Novo driver pode ampliar risco de suspensão | [Vibepollo #658](https://github.com/Nonary/Vibepollo/issues/658), relato de bugcheck com VHF | Não importar driver experimental como requisito de confiabilidade |

O README do Vibepollo anuncia WGC em contexto de serviço, automações e integrações.
São capacidades anunciadas pelo projeto, não resultados comparativos validados
neste fork. Relatos de Reddit sem URL e reprodução identificável não sustentam
uma decisão técnica registrada como fato. Não foi feito profiling de hardware nesta revisão.

## Baseline funcional publicada

Referência G02 congelada, sem substituir os arquivos da release:

| Item | Identidade / resultado |
| --- | --- |
| Código | `ed3b23951c5e26942ba1675d4993e21ff468f39a` — Apollo 1.0.2 |
| ZIP SHA-256 | `225f04786c3363ce4a5d074f5f59441bd7222262855e6e701a296a0344bc7ccb` |
| Instalador SHA-256 | `a6af1af2c3039ad996c596ea9e9aca4c0c06570b20c85f6837843311abf8a68a` |
| Repositório | [CI 40436338095](https://github.com/matheuspergoli/Apollo/actions/runs/40436338095), aprovado |
| Frontend | [CI 40436338061](https://github.com/matheuspergoli/Apollo/actions/runs/40436338061), aprovado |
| Windows | [CI 40436338074](https://github.com/matheuspergoli/Apollo/actions/runs/40436338074), aprovado |
| Atualização | Fixtures 1.0.0 e 1.0.1 → 1.0.2, NSIS `/NoHostIntegration`, preservação byte a byte |
| Ciclo do host | Helpers distribuídos, preferência de inicialização/conta, confirmação HTTP, novo PID e endpoint respondendo |
| Campanha A/A de streaming em hardware | **Não executada**; não há percentis ou resultados de performance desta baseline |

Os hashes e a identidade foram conferidos nos assets publicados. Os CIs não provam
streaming de hardware nem instalação completa de drivers. Uso funcional relatado
em outra versão não se transforma em benchmark da 1.0.2. As evidências de build e
de hardware permanecem separadas.

## Iniciativas

Prioridade indica ordem de investigação, não ganho garantido, prazo ou autorização
para implementação. Segurança e bugs concretos podem interromper qualquer fase.

| ID | Iniciativa | Estado inicial | Condição de avanço / resultado esperado |
| --- | --- | --- | --- |
| G01 | Inventário de divergências e upstream | Fechado no recorte inicial; inventário vivo acima | Reabrir a avaliação no snapshot e conjunto de dependências de cada integração |
| G02 | Baseline reproduzível | Referência funcional fixada; campanha A/A de hardware pendente | Executar o protocolo sem alterar a configuração funcional; guardar resultados privados e comparáveis |
| G03 | Telemetria do host, “Observatory” | Parcial: timestamps e min/max/média existentes | Uma fatia pequena com semântica, cobertura, custos e correlação verificados; sem UI inicialmente |
| G04 | Exportação segura de diagnóstico | Investigar após contrato mínimo de G03 | Allowlist, autenticação, limites e redação testados antes de expor dados |
| G05 | Ownership e recuperação de display, “StateGuard” | Parcial: preparo/reversão já existem | Mapear escritores atuais, identidade e conflitos; propor mudança pequena que proteja alterações próprias |
| G06 | Recuperação limitada e idempotente | Parcial: scheduler e reset existentes | Prazos, orçamento, cancelamento e falha terminal verificáveis; requisito de toda nova automação |
| G07 | Correlação de hotplug, EDID e overlays | Investigar | Identificar eventos observáveis sem coleta invasiva ou sondagem contínua desnecessária |
| G08 | Comparação DDX × WGC | Investigar após baseline | Mesma carga e alvo; comparar regularidade, idade e erros, sem trocar o padrão antecipadamente |
| G09 | WGC em outro contexto de execução | Em espera: alto risco | Demonstrar lacuna do caminho atual; revisar privilégio, desktop seguro, suspensão e término de helpers |
| G10 | Fallback de captura | Investigar após falha reproduzida | Recuperar sem trocar o display autorizado nem ignorar privacidade ou consentimento |
| G11 | Cópias, contenção e filas GPU | Investigar após G03 | Localizar custo medido antes de alterar sincronização ou interoperabilidade |
| G12 | NVENC/HAGS sob carga | Investigar | Comparar carga GPU/VRAM e estabilidade; não automatizar alterações globais no Windows |
| G13 | Diagnóstico de frame pacing | Parcial: pacing e logs existentes | Distinguir jogo, compositor, captura, duplicação e apresentação observada no cliente |
| G14 | Limite de FPS opcional por aplicação | Em espera | Necessidade comprovada, consentimento e restauração da integração externa; não obrigatório para jogar |
| G15 | Políticas de encoder por aplicação | Em espera | Regra concreta não atendida pelas opções existentes, sem sobrepor configurações implicitamente |
| G16 | Perfis transacionais | Em espera | UX aprovada separadamente, conjunto pequeno e rollback dos efeitos próprios |
| G17 | Diagnóstico e recuperação de áudio | Parcial: captura/logs e configuração existentes | Sintoma reproduzido; ownership e restauração de dispositivos antes de automatizar |
| G18 | Saúde do serviço e da sessão | Parcial: serviço/HTTPS/reinício testados | Não tratar processo vivo como prova de captura e streaming funcionais |
| G19 | Integração upstream seletiva | Política definida; revisão contínua | Origem, licença, necessidade, diff e regressão em cada integração |
| G20 | Gates de release e regressão de desempenho | Parcial: CI e auditorias existentes | Acrescentar comparação de hardware adequada à mudança, sem confundi-la com CI hospedado |

## Sequência de entregas

1. **Referência e inventário:** concluir o recorte inicial de G01/G02 e esclarecer
   sinais existentes. A release 1.0.2 continua sendo referência estável.
2. **Telemetria mínima sem painel:** uma pergunta respondida de ponta a ponta no
   host, com overhead medido; decidir exportação somente após revisão de privacidade.
3. **Recuperação previsível:** orçamento e ownership nos caminhos existentes antes
   de criar um coordenador novo ou aumentar as alterações automáticas do Windows.
4. **Experimentos de captura:** DDX/WGC no ambiente adequado. Helpers e contextos
   alternativos só com necessidade e plano de término/falha explícitos.
5. **Otimizações e experiência:** promover apenas mudanças que superem a baseline;
   perfis, gráficos e outras alterações visuais exigem proposta e aprovação próprias.

As sugestões v1.1–v1.5 do estudo não são reservas de versão nem compromissos de
entrega. Cada versão será definida pelo menor conjunto coeso e qualificado.
Um bug crítico de sessão não espera a conclusão de um futuro painel de métricas.

## Fora do escopo ativo

- PyroWave e VRR que exigem extensão no cliente; Artemis e protocolo permanecem compatíveis.
- Driver próprio de gamepad, substituição imediata do SudoVDA e port integral do Vibepollo.
- A migração para libvirtualhid continua em espera, não é pré-requisito deste plano.
- Reescrita de NVENC, ajuste automático agressivo de Windows, novo dashboard ou
  multiplicação de presets sem problema e critério de aceitação concretos.
- Ampliação de produto como WebRTC, novos clientes ou plataformas prioritárias.
  Preservar Linux não significa anunciar uma nova matriz de suporte validada.

## Integração de upstream

Três trilhas: correções de segurança/compatibilidade prioritárias; melhorias
seletivas para necessidade reproduzida; experimentos isolados, desativados por
padrão quando alteram comportamento. Não importar toda uma trilha por reputação.

No PR, registrar fonte e SHA, licença, arquivos/dependências, comportamento anterior,
justificativa e testes do contrato do Apollo. Revisar `LICENSE`/`NOTICE` quando
necessário; não criar documentos de proveniência por componente. A entrada no
roadmap aponta o PR e seu resultado, inclusive quando a hipótese for rejeitada.
