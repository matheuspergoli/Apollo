# Apollo dashboard

Apollo's only web implementation is this React package, with all eight host page
entries and no parallel legacy frontend. It is a validation candidate, not yet a
hardware-accepted replacement release. Evidence and limitations are tracked in
[MIGRATION.md](MIGRATION.md); the isolated hardware acceptance procedure is in
[TESTE-NO-HOST.md](TESTE-NO-HOST.md).

## Templates por seção

Em Configurações, selecione uma seção e use **Baixar template da seção**. O ZIP
contém `configuracao.json` com os padrões e `LEIA-ME.md` com tipos, valores aceitos,
limites, efeitos e exemplos. Não é uma exportação dos dados atuais do host.

Edite o JSON, importe na mesma seção e confirme **Aplicar ao rascunho**. Campos
ausentes e outras seções permanecem intactos. Arquivos inválidos são rejeitados
integralmente. Só **Revisar e salvar** grava o arquivo; nada reinicia automaticamente.
O limite de importação é 256 KiB, UTF-8. Não coloque senhas/chaves privadas no JSON.

## Configuração global

O bloco **Todas as configurações** mantém os controles por seção e acrescenta:

- **Baixar template completo:** padrões dos 99 campos em 11 seções de Windows/Linux, sem dados do host. O Windows mostra 10 seções; VA-API pertence ao Linux.
- **Exportar configurações salvas:** após confirmação de privacidade, lê novamente
  o arquivo no host. Exporta campos conhecidos, normalizados para JSON, com os
  padrões dos campos ausentes; não inclui o rascunho não salvo.
- **Importar configuração completa:** valida o JSON inteiro (até 1 MiB), mostra
  diferenças por seção e aplica os campos presentes somente após confirmação.
  Um erro em qualquer seção rejeita tudo. Seções/campos omitidos permanecem intactos.

Cada ZIP contém `configuracao.json`, `LEIA-ME.md` e a documentação das 11 seções.
O formato global é `apollo-settings`, versão 1, separado do JSON por seção.
Depois da importação, **Revisar e salvar** continua obrigatório para gravar.
Não há reinício automático, nem conversão silenciosa de opções entre plataformas.

Isto não é backup da instalação inteira: não inclui biblioteca, pareamentos,
conta, conteúdo de certificados/chaves, logs ou opções desconhecidas. Caminhos
e comandos podem conter dados privados. A exportação ocorre localmente, sem
enviar arquivos a serviços externos; o ZIP não é criptografado. Não compartilhe
o arquivo sem revisão.

## Configuração de um aplicativo

No editor de aplicativo novo ou existente há **Baixar template de aplicativo**,
**Exportar aplicativo do editor** e **Importar JSON de aplicativo**. O ZIP contém
`aplicativo.json`, `LEIA-ME.md` e `schema.json` gerado do contrato Zod. A referência
`$schema` é local e fixa; o importador não consulta schemas externos.

O formato é `apollo-application`, versão 1, com campos em `application`. Aceita
importação parcial: campos omitidos mantêm o rascunho. O aplicativo resultante
inteiro precisa ser válido, inclusive nome ao criar. Só **Salvar aplicativo**
grava a biblioteca; importar não executa comandos ou inicia o stream.

UUID/identidade do host, estado de execução e campos desconhecidos não são
exportados nem aceitos no arquivo. Ao editar, a identidade e os campos extras
locais são preservados; ao criar, a identidade é gerada pelo host ao salvar.
Exportar inclui o rascunho, não necessariamente o último arquivo salvo, e exige
confirmação de privacidade. O ZIP não é criptografado nem transfere capas/binários.
Não há importação global da biblioteca nesta funcionalidade; `.art` continua
sendo apenas um atalho Artemis, não um arquivo de configuração de aplicativo.

## Permissões de dispositivos e valores por seção

Só o editor de um dispositivo **já pareado** possui os três controles de arquivo:
template conservador, exportação do rascunho e importação com revisão. O formato é
`apollo-device-permissions`, versão 1, com `settings`; o ZIP inclui dispositivo.json,
guia e schema. Nome, UUID, certificados e estado de conexão não transitam. Bits
desconhecidos são rejeitados; salvar permissões pode desconectar um cliente se
a visualização for revogada. Pareamento/criação continuam com o fluxo anterior.

Cada seção de configurações agora também exporta **valores salvos da seção**,
lidos novamente do host, sem o rascunho e sem depender de seções inválidas não
relacionadas. Template continua sendo padrões; ambos usam o mesmo formato fechado
por seção. Exportações de valores atuais pedem confirmação de privacidade.

## Estado dos aplicativos, capas e ações do host

A biblioteca consulta o estado declarado pelo host a cada 3 segundos quando
visível, ao recuperar foco e manualmente. Pausa durante a edição e após erro;
em erro, não afirma que o estado antigo continua válido. Mudança de estado fecha
confirmações de operações antigas, em vez de transformar Encerrar em Iniciar.

Selecionar PNG envia uma cópia ao host; o navegador não revela o caminho original
completo. O backend grava os bytes em modo binário, verifica assinatura/tamanho e
falhas de escrita. Para usar um PNG já no host, informe o caminho completo sem
aspas no campo da capa. Comandos, por outro lado, podem precisar de aspas.
Arquivos corrompidos por versões anteriores precisam ser enviados novamente;
o original não é substituído e não há reparo automático de arquivos privados.

Abrir no Artemis oferece link e QR: o protocolo `art://launch` é tratado pelo
cliente instalado no dispositivo que abre o link, com o host já pareado. Não é
um comando de abertura remota do PC para o celular e não confirma que o cliente abriu.

O atalho global de reinício exige confirmação, bloqueia rascunhos/operações pendentes
e usa feedback conservador quando a conexão cai. Primeiro acesso redireciona ao login
com mensagem de sucesso. Formulários aceitam Enter onde há submit nativo; na busca
ele não salva e em campos multilinha continua inserindo uma linha.

### Arquitetura dos arquivos

`src/lib/configuration-files.ts` concentra leitura UTF-8/BOM, limites em bytes,
profundidade, bloqueio de chaves perigosas/NUL, resumo de erros pt-BR e geração de
ZIPs com caminhos seguros. Cada área declara seu contrato estrito Zod e mantém
as regras nativas/de merge próprias. Não há coerção genérica de tipos ou fallback
para formatos antigos. Novos campos de aplicativo exigem default + schema; testes
verificam que a documentação/importação/exportação cobrem a mesma lista.
Validação de estrutura não torna comandos confiáveis: importe apenas arquivos
de origem conhecida e revise os efeitos antes de salvar. O build inclui os
arquivos de licença/avisos em `dist/licenses`, sem recolocar um rodapé na interface.

### Busca e navegação

A busca de configurações normaliza acentos/caixa/pontuação, exige todos os termos
e prioriza rótulos/chaves antes de descrições. Inclui títulos e opções disponíveis,
não dados privados atuais, e oferece limpar/Escape. Não usa fuzzy matching nem
serviços externos. A sidebar e a barra superior usam a mesma faixa de 64px, com
metadados inferiores compactos; testes verificam alinhamento em temas e larguras.

## Stack e versões

React/DOM 19.3.1, strict TypeScript 7.0.2, Vite 8.3.4/React plugin 6.1.2,
Tailwind/Vite plugin 4.3.3, Query 5.104.5, Router 1.170.45, official Router Vite
plugin 1.168.47/generator 1.167.45. Biome 2.5.15, Vitest 5.0.5, Playwright 1.64.1.
Versions are exact-pinned with package-lock.json and checked against actual peer
compatibility; TanStack packages do not all share identical release numbers.

Use official shadcn base-lyra/Base UI sources for primitives. Use the regular
Select, not NativeSelect. Own components compose Apollo behavior/screens rather
than recreating controls. Tailwind utilities and semantic tokens replace bespoke
visual classes; .dark is the standard theme selector. No Vue/Bootstrap runtime
exists in this package. The interface is fixed to pt-BR: no i18n dependencies,
providers, catalogs, language selector, language endpoint or opaque locale adapter.

Editor action bars reuse Card's outline and spacing rather than mixing an inset
border with the cards' outer ring. Keep 16px inner padding and 8px action gaps;
validate full-content alignment, including sidebar transitions and capped desktop
widths. Do not compensate for mismatched box models with negative margins.

The user's ~/monorepo was read for Biome, shadcn, theme, TS and Router/Query
conventions. No private auth, tRPC, infrastructure, DB or environment was copied.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source/license changes.

## Commands

```sh
npm ci --ignore-scripts
npm run routes:generate
npm run check
npm run typecheck
npm test
npm run check:dev
npm exec playwright install --with-deps chromium
npm run test:browser
npm run dev
```

`pnpm dev` also runs the script when dependencies are installed. The committed
installation lock is npm's; do not mix installers/lockfiles in one checkout.
Dev binds 127.0.0.1:5174 and does not proxy to the real host automatically. Without
the native API or test fixture, API-backed screens show an error, not fake data.
`test:browser` builds fresh assets first to prevent stale-dist test results.

## File-based routes

`src/routes/__root.tsx` owns typed QueryClient context and global boundaries.
`_host.tsx` is the pathless sidebar layout; its files map to the existing host
URLs. Login/welcome are outside that layout. Screen/domain logic stays in pages/,
features/ and lib/. router.tsx only creates the router from routeTree.gen.ts.

The official Vite plugin runs **before React**, generates the tree and splits
route components automatically. Generated files/.tanstack output are ignored by
Git and Biome. Pre-typecheck generation uses the official ESM Generator/getConfig
API, avoiding the current CLI CommonJS circular-export warning without hiding
warnings or manually generating a tree. No TanStack Start is required.

Intent preloading loads route code, never mutations. Query owns freshness and
cancellation. No automatic mutation retries or focus refetch. No DB was added
merely to duplicate Query's server-state cache. Start does support static SPA;
revisit it only for concrete deployment/SSR/server-function requirements.

## Organization and integrity

- main.tsx: mount/providers; router.tsx: router factory.
- routes/: small typed file routes/search/boundaries.
- pages/: screens and request/user-action orchestration.
- features/settings/: 99 active backend fields, defaults, validators and structured
  command/display editors; apps/devices: payload and protocol handling.
- lib/: HTTP/cache/download boundaries; components/: Apollo composition.
- components/ui/: official shadcn source, cva/cn variants and recorded adaptations.
- styles.css: semantic tokens, minimal base and local font imports.

Config POST rewrites the file. Preserve unknown fields/structures, strip response
metadata/defaults, validate first and compare a fresh snapshot before saving.
The removed locale key is rejected by the server and excluded from new saves,
not preserved as a compatibility option. Other unrelated values remain intact.
This is a best-effort conflict check, not atomic CAS: the backend has no revision
contract. Saving and restarting are separate. Destructive/session actions require
confirmation; connection loss is not evidence a restart/quit succeeded. Logs can
contain private data. Never invent metrics or claim device performance gains.

## Build/development regression checks

Fontsource 5.3.0 does not contain latin.css despite its wildcard export. Supported
package entry imports are used; unicode-range limits actual browser font downloads.
`check:dev` starts/closes its own ephemeral server and verifies CSS, generated
routes and both Latin font resources over HTTP, without stopping the user's dev.

`build` emits all eight HTML filenames read by C++ and absolute /assets URLs,
supporting direct URLs/trailing slashes. `build:host` also stages generated assets
under SUNSHINE_ASSETS_DIR/assets/web, not the user's installation. Source maps
are opt-in with APOLLO_UI_SOURCEMAP=true. The host fixture serves the actual HTML
files, not a catch-all that could conceal missing host entries.

The old hash-preview source and packager were removed. CMake builds only the
React package and replaces its managed staging output rather than merging old
catalogs/chunks into it. Native tray/favicon assets were preserved unchanged.
Do not
deploy over the working host, remove rollback data or release a "complete" ZIP
until the migration matrix and native integration gates are satisfied.
