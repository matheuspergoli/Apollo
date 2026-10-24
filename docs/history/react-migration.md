# Histórico da migração React

Registro de engenharia anterior à versão 1.0. Contagens, limitações e nomes de
artefatos abaixo descrevem suas respectivas etapas, não instruções de uso atuais.
Consulte [a documentação da versão 1.0](../release-1.0.md) para o produto publicado.

## Entrega de engenharia

A implementação web é inteiramente React. Não há painel antigo, prévia paralela,
Vue/Bootstrap, catálogos, provedor i18n, seletor de idioma ou endpoint de idioma.
O candidato usa pt-BR fixo, mantendo Unicode e os contratos nativos necessários.
Não é uma declaração de perfeição nem de validação no hardware do usuário.

| Área | Implementado e verificado nesta etapa |
|---|---|
| Páginas | Oito entradas HTML reais, rotas por arquivos, reload e navegação |
| Configuração | 99 opções nativas em 11 grupos Windows/Linux (10 visíveis no Windows); busca, revisão, validação, gravação, preservação de chaves desconhecidas, conflito e rascunhos |
| Dispositivos | PIN, OTP/QR/expiração, permissões, display, comandos/elevação, desconectar e desvincular individual/todos |
| Aplicativos | Criar/editar/ordenar/excluir, comandos, capas online/PNG, iniciar/encerrar e exportação `.art`/link Artemis |
| Conta | Criação/login, troca de credenciais, feedback de erro e invalidação de sessão |
| Diagnóstico | Logs limitados/filtrados, copiar/baixar, recuperação confirmada e resultado desconhecido após perda de conexão |
| Interface | Componentes shadcn/Base UI, temas, fontes locais, layouts 390/1280px, teclado/Escape e restauração de foco |
| Build | CMake usa somente React; estágio limpo, imagens preservadas, pacote e auditoria automatizada |

## Evidência automatizada

- Biome sem diagnósticos; TypeScript estrito; build de produção e integração dev.
- O candidato anterior passou em 34 testes unitários e 60 testes Chromium. A nova
  rodada inclui testes adicionais de templates e layout, listados abaixo.
- Quatro testes Python do auditor de pacote passaram, incluindo rejeição de
  caminhos inseguros, dados privados, assets alterados e páginas ausentes.
- 19 verificações de relógio passaram com UBSan; também executadas no runner Windows.
- Windows aprovado em `86bc895` (run 39633089724) e `4b334fc` (run 39639763722):
  compilação, contratos, pacote, HTTPS e assets React autenticados, gravação UTF-8,
  criação/edição/exclusão de aplicativos, campos desconhecidos e invalidação de sessão.
- O candidato final `b838a8e` também passou no Windows (run 39643282091), incluindo
  auditoria automatizada do pacote e integração HTTPS/React. O ZIP foi baixado e
  auditado novamente: 146 entradas, oito páginas e 19 imagens. SHA-256 final:
  `be2135c924b52c633d49b8ef99ab29907c2b731ce4afa663df20e7ff8f50e55d`.
  As alterações posteriores em `b156223` corrigem documentação/geração de ícones,
  sem alterar os fontes ou assets executáveis desse candidato.
- O ZIP aprovado de `86bc895` foi auditado: oito HTMLs, 19 imagens preservadas,
  nenhum caminho legado ou arquivo privado identificado. SHA-256:
  `65b2915755a881e824d71de5fc4a159b03e2924e4d4554bd97615e41cc69e87c`.

O artefato final foi aprovado e preparado separadamente para aceitação manual,
sem iniciar ou instalar o host. Não substituir o binário aprovado por assets de
outro commit. `releaseReady:false` significa candidato aguardando
aceitação no hardware, não existência de um segundo frontend incompleto.

## O que depende do usuário

O usuário confirmou pareamento e um trecho de jogo no candidato anterior. Isso
não equivale à aceitação de todos os ajustes ou à medição de latência/HDR.

O roteiro completo está em [TESTE-NO-HOST.md](TESTE-NO-HOST.md): teste isolado no
Windows/S25+, pareamento real, display/driver, áudio/entrada, stream/FPS/HDR,
navegação no navegador do celular e retorno ao host original. Nenhuma instalação,
conta, chave, serviço ou pareamento ativo foi alterado automaticamente.

## Ajustes após o primeiro teste manual

- Removido o bloco estático “Referência do projeto”.
- Corrigidos os atributos de orientação das abas de pareamento; botões compactos,
  QR ao lado dos dados no desktop, layout móvel e altura do diálogo limitados.
- Templates JSON por seção em ZIP com documentação gerada das mesmas 102 opções.
  Importação validada/atômica para o rascunho, com confirmação, sem gravação/reinício
  automático. Formato, versão, seção, tipos, opções e limites são verificados.
- `fflate` 0.8.3 foi adicionado com versão exata apenas para gerar o ZIP no navegador.
  Nenhum serviço remoto é usado para exportar ou importar templates.
- Rodada local aprovada: 49 testes unitários, 67 Chromium, TypeScript estrito,
  Biome, build e integração dev. Templates das 12 seções, ZIP/documentação, erros
  de validação, importação parcial e preservação de rascunhos foram exercitados.
- O ensaio Windows foi ampliado para importar JSON no rascunho e verificar que
  só a gravação explícita altera o arquivo nativo. Passou no commit `6a26ceb`, run
  39719003879, incluindo build e auditoria do ZIP (147 entradas, oito HTMLs,
  19 imagens). SHA-256: `7b37ef7308349476426aca2934c0aefe187a13064315e9706815b26747a47861`.
- O pipeline frontend desse commit encontrou apenas formatação não estabilizada
  em um teste de importação. O teste foi simplificado para uma variável local,
  sem alterar código executável. Biome check, TypeScript, 49 testes unitários e os
  três testes de importação passaram novamente; o pipeline frontend será repetido.
- O teste manual seguinte mostrou retorno à porta padrão após importar opções de
  rede. A leitura limitada do arquivo de teste confirmou opções gravadas e ausência
  de `port`; o parser usa o padrão nesse caso. O restart Windows preserva a linha
  de comando. Não foi identificada perda geral de persistência nesses dados.
- As abas PIN/QR agora compartilham padding e espaçamento. Importação e revisão de
  porta exibem aviso específico; após salvar, o painel informa o novo endereço.
  Reinício em Configurações usa a mesma semântica de resultado desconhecido de
  Diagnóstico quando a conexão cai, sem afirmar sucesso/falha ou repetir a ação.
- Rodada local dessas correções: 53 testes unitários e 69 de navegador passaram,
  com Biome sem diagnósticos, TypeScript e build aprovados. Os testes verificam
  offsets iguais das abas, aviso da nova porta e retorno ao valor padrão após
  recarga, além do resultado incerto de reinício sem retry automático.

## Limitações conhecidas, não escondidas

- O conflito de configuração usa comparação antes da gravação, não transação
  atômica no backend. Evite edições simultâneas em dois painéis.
- O host pode levar mais de 10s para atualizar a biblioteca sem driver virtual;
  somente essas gravações têm orçamento de 30s. Não há retry automático.
- Um timeout de escrita não prova falha: a operação pode ter sido aplicada.
- Testes simulados não demonstram pareamento real ou ações físicas. O runner
  Windows valida web/API, não GPU do usuário, HDR, input-to-photon ou estabilidade
  de streaming. Os testes de teclado não equivalem a certificação de acessibilidade.
- O candidato não instala drivers nem substitui o serviço. O retorno à versão
  anterior depende de manter pastas e dados originais separados.

Falhas e correções anteriores estão em [validation-history.md](validation-history.md).

## Configuração global e áudio

- A camada por seção foi mantida; há agora template completo, exportação explícita
  dos valores salvos (GET fresco, sem rascunho) e importação global com revisão.
  São 102 campos conhecidos em 12 seções; não é backup de conta/pareamentos/apps.
- Os ZIPs incluem JSON e documentação. Validação global é integral: formato/versão,
  tamanho, profundidade, seções, tipos, limites e chaves inseguras/desconhecidas.
  Nenhum campo é aplicado se outro for inválido. O salvamento continua separado.
- O usuário relatou cortes breves de áudio já existentes antes da migração. Não
  há correlação temporal suficiente com o encoder para atribuir causa. O roteiro
  `docs/audio-dropout-investigation.md` usa mensagens já existentes e estatísticas
  do cliente; drivers, buffers, bitrate e prioridades não foram alterados.
- Rodada local aprovada: 72 testes unitários, 74 testes Chromium, Biome,
  TypeScript, build e integração dev. A porta também rejeita valores fracionários.
  O ensaio Windows foi estendido para importar várias seções, gravar explicitamente
  e baixar/verificar o ZIP com os valores realmente salvos. Passou no commit
  `fea1dd3`, run 39842119992, com auditoria do pacote (148 entradas, oito HTMLs,
  19 imagens). SHA-256: `cc59b0929794c5956741b343ad03a5238bb712d725e07ebd432ae6777ea397ac`.
- O frontend desse commit passou em 73 de 74 testes; a falha restante mediu os
  retângulos do campo e do painel em frames distintos durante a recentralização
  do diálogo. O teste agora aguarda fontes/animação e mede ambos na mesma tarefa
  do navegador, mantendo a tolerância de 1 px. Quarenta execuções repetidas passaram
  sem retries. Essa correção altera somente teste/documentação, não os assets
  executáveis do candidato; o CI frontend será repetido antes da entrega.

## Refino de alinhamento e espaçamentos

- Removido o rodapé visual “Apollo · instalação de teste / Código e proveniência /
  Licença”. Os arquivos de licença e os avisos do projeto não foram removidos.
- O estreitamento aparente das barras veio do uso de borda interna, enquanto os
  cartões usam contorno externo. As três barras de editor agora reutilizam Card,
  com o mesmo contorno, padding de 16 px e espaçamento de 8 px entre botões.
  Cabeçalhos de aplicativos e dispositivos usam o mesmo alinhamento superior/gap.
- Regressões verificam bordas horizontais, contorno, recuo do último botão,
  padding simétrico, foco e camada sticky em dispositivos, aplicativos e
  configurações. Cobrem 390/768/1440/1920 px, claro/escuro, rolagem e sidebar
  expandida/recolhida; capturas também foram revisadas.
- Rodada local aprovada: 72 testes unitários, 82 testes de navegador, TypeScript,
  Biome e build. Essa validação é de alinhamentos concretos, não uma certificação
  universal de renderização idêntica em todo navegador/DPI. O novo pacote ainda
  deve passar no CI do mesmo commit antes da entrega para teste manual.

## Busca, navegação e arquivos de aplicativo

- Busca sem acentos, caixa ou dependência de ordem dos termos, com ranking por
  rótulos/chaves e suporte a opções/grupos. Limpeza por botão/Escape; sem fuzzy ou
  novas consultas ao servidor. Switches habilitados usam cursor pointer.
- Header da sidebar e barra superior alinhados em 64px; footer de metadados usa
  a mesma faixa, com padding/ritmo menores que a versão anterior. O alinhamento
  é verificado geometricamente, não uma promessa de renderização universal.
- Importação/exportação individual de aplicativo na criação/edição, sem importação
  global da biblioteca. ZIP com JSON, guia e schema gerado pelo Zod 4.6.7.
- Leitura/segurança/ZIP compartilhados entre os formatos; contratos fechados Zod
  para envelopes e opções de aplicativo. UUIDs não transitam; importação é atômica,
  contextual ao rascunho, sem salvar/executar automaticamente ou apagar dados locais.
- Rodada local aprovada: 99 testes unitários e 94 testes de navegador, Biome,
  TypeScript, build e integração dev. Os testes medem headers/footer em 64px,
  centros alinhados em celular/tablet/desktop, cursor habilitado/desabilitado,
  busca sem acentos/múltiplos termos e os fluxos individuais de aplicativo.
- O ensaio Windows agora importa um aplicativo novo e uma edição parcial, verifica
  que o UUID e campos locais permanecem intactos e exporta o ZIP real do editor.
  Essa extensão depende do CI do novo commit antes da entrega. O bloco principal
  não teve aumento no bundle de entrada; a validação Zod é carregada nos módulos
  de configuração/aplicativos, compartilhada entre eles.

## Capas, estado externo e usabilidade

### Refinamento de sessão e apresentação

- Respostas 401 exibem reentrada em outra aba, preservando rascunhos. O reinício
  fica bloqueado até verificar a sessão; renovar o acesso não repete mutações.
- Reiniciar host tem rótulo visível no header. Diálogo Artemis sem overflow
  horizontal verificado em 320, 390, 640 e 1280 px; header/editor também em 768 px.
- Visão geral identifica configurações salvas e explica a negociação com o cliente
  sem sugerir que os valores salvos não valem. Removidas referências de laboratório
  e ressalvas redundantes da interface; mantidos limites reais de medição.
- Validação local: 117 unitários, 112 testes Chromium, Biome, TypeScript e build.
  Ensaio Windows ampliado para rejeição de reinício sem sessão e recuperação sem replay.

- Investigação somente leitura confirmou corrupção da cópia PNG no Windows por
  gravação em modo texto. Corrigido para modo binário, com assinatura/tamanho e
  verificação de falha na escrita; o caminho de upload é uma cópia em config/covers,
  não o caminho original do seletor do navegador. Caminhos com aspas externas são
  rejeitados no editor. Nenhum arquivo ativo do usuário foi reparado/alterado.
- Estado dos cards: GET periódico de 3s visível/foco/manual, pausado na edição e
  em erro, sem POST automático. Estado antigo não é afirmado após erro. Confirmação
  obsoleta é desmontada se a operação mudar, evitando trocar Encerrar por Iniciar.
- O contrato art://launch foi conferido no cliente Artemis: abertura local ao
  dispositivo do navegador, não RPC PC→celular. A UI agora explica isso e oferece
  QR/link/atalho, sem alegar abertura bem-sucedida de um aplicativo externo.
- Placeholder simplificado; ícone de logs alinhado aos atalhos; reinício global
  confirmado e protegido por rascunhos/mutações pendentes. Cadastro continua ao
  login automaticamente com feedback. Enter revisa configurações sem gravar,
  submete formulários apropriados e não envia ao digitar em campos multilinha.
- Perfil JSON individual de permissões no editor, sem alterar pareamento, nomes,
  UUIDs ou certificados. Templates conservadores e revisão legível de permissões.
  Terceiro botão de exportação salva adicionado às seções de configuração.
- Rodada local: 117 testes unitários e 105 Chromium, Biome, TypeScript, build e
  integração dev aprovados. O ensaio Windows ganhou comparação byte a byte do PNG
  e rejeição de upload inválido sem sobrescrever a cópia válida; essa mudança nativa
  ainda requer aprovação do novo CI antes de preparar o pacote correspondente.
- O Windows de `7d5253e` passou (run 39947451628), incluindo bytes do PNG iguais
  ao upload e rejeição de imagem inválida sem sobrescrever a válida. O frontend
  parou antes dos testes por ordenação de imports/formatação em três arquivos.
  A correção é apenas de estilo; Biome e os 105 testes de navegador passaram de
  novo localmente, além dos 117 unitários e TypeScript. O novo commit será validado
  pelos dois pipelines antes da entrega.
