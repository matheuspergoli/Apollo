# Estado da migração Apollo

## Entrega de engenharia

A implementação web é inteiramente React. Não há painel antigo, prévia paralela,
Vue/Bootstrap, catálogos, provedor i18n, seletor de idioma ou endpoint de idioma.
O candidato usa pt-BR fixo, mantendo Unicode e os contratos nativos necessários.
Não é uma declaração de perfeição nem de validação no hardware do usuário.

| Área | Implementado e verificado nesta etapa |
|---|---|
| Páginas | Oito entradas HTML reais, rotas por arquivos, reload e navegação |
| Configuração | 102 opções nativas em 12 grupos; busca, revisão, validação, gravação, preservação de chaves desconhecidas, conflito e rascunhos |
| Dispositivos | PIN, OTP/QR/expiração, permissões, display, comandos/elevação, desconectar e desvincular individual/todos |
| Aplicativos | Criar/editar/ordenar/excluir, comandos, capas online/PNG, iniciar/encerrar e exportação `.art`/link Artemis |
| Conta | Criação/login, troca de credenciais, feedback de erro e invalidação de sessão |
| Diagnóstico | Logs limitados/filtrados, copiar/baixar, recuperação confirmada e resultado desconhecido após perda de conexão |
| Interface | Componentes shadcn/Base UI, temas, fontes locais, layouts 390/1280px, teclado/Escape e restauração de foco |
| Build | CMake usa somente React; estágio limpo, imagens preservadas, pacote e auditoria automatizada |

## Evidência automatizada

- Biome sem diagnósticos; TypeScript estrito; build de produção e integração dev.
- 34 testes unitários e 60 testes Chromium com APIs simuladas passaram localmente.
- Quatro testes Python do auditor de pacote passaram, incluindo rejeição de
  caminhos inseguros, dados privados, assets alterados e páginas ausentes.
- 19 verificações de relógio passaram com UBSan; também executadas no runner Windows.
- Windows aprovado em `86bc895` (run 39633089724) e `4b334fc` (run 39639763722):
  compilação, contratos, pacote, HTTPS e assets React autenticados, gravação UTF-8,
  criação/edição/exclusão de aplicativos, campos desconhecidos e invalidação de sessão.
- O ZIP aprovado de `86bc895` foi auditado: oito HTMLs, 19 imagens preservadas,
  nenhum caminho legado ou arquivo privado identificado. SHA-256:
  `65b2915755a881e824d71de5fc4a159b03e2924e4d4554bd97615e41cc69e87c`.

As últimas alterações de fechamento precisam passar no CI do mesmo commit antes
de o artefato correspondente ser entregue. Não substituir um binário aprovado
por assets de outro commit. `releaseReady:false` significa candidato aguardando
aceitação no hardware, não existência de um segundo frontend incompleto.

## O que depende do usuário

O roteiro completo está em [TESTE-NO-HOST.md](TESTE-NO-HOST.md): teste isolado no
Windows/S25+, pareamento real, display/driver, áudio/entrada, stream/FPS/HDR,
navegação no navegador do celular e retorno ao host original. Nenhuma instalação,
conta, chave, serviço ou pareamento ativo foi alterado automaticamente.

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

Falhas e correções anteriores estão em [VALIDATION-HISTORY.md](VALIDATION-HISTORY.md).
