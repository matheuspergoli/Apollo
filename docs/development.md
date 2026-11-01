# Desenvolvimento

## Ambiente

Use Node.js 24 e a versão de pnpm fixada em `package.json`. O repositório tem um
workspace pequeno: comandos na raiz delegam ao pacote `dashboard/`, e existe um
único `pnpm-lock.yaml`. Não misture gerenciadores nem regenere o lockfile para
resolver uma falha de instalação.

```sh
corepack enable pnpm
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Também é possível instalar a versão declarada de pnpm pelo mecanismo oficial
do gerenciador. O CI usa uma ação fixada por commit e instala com lockfile congelado.
Verificações rodam na `main` e em pull requests. Políticas do repositório e links
da documentação são verificados em um job leve, sem esperar a compilação Windows.
Scripts de instalação de dependências ficam desabilitados. Novas dependências que
precisem executar código na instalação exigem revisão explícita, não liberação geral.

## Comandos

```sh
pnpm check          # Biome
pnpm typecheck     # geração de rotas e TypeScript estrito
pnpm test          # regras de domínio e ferramentas de build
pnpm build         # produção, sem editar uma instalação do host
pnpm test:browser  # build e regressões Playwright
pnpm verify        # sequência completa do frontend
```

Antes do primeiro teste de navegador, execute
`pnpm --dir dashboard exec playwright install --with-deps chromium`.
Na instalação local, dependências de sistema podem exigir permissões.
O job de frontend usa a imagem oficial Playwright, com versão correspondente ao
pacote fixado e digest imutável. Navegadores e bibliotecas de sistema vêm nessa
imagem; o CI instala somente as dependências pnpm do projeto. Ao atualizar
Playwright, revise juntos a versão do pacote e a imagem, sem mudar os testes para
compensar incompatibilidades do ambiente.

Ferramentas de distribuição têm testes independentes:

```sh
python -m unittest discover -s tools/release -p 'test_*.py'
```

O build nativo usa CMake e chama pnpm para gerar a interface. Consulte
[building.md](building.md) para as dependências C++ e empacotamento. `PNPM_OFFLINE=ON`
requer um store previamente preenchido. Não é um modo de ignorar dependências ausentes.

## Organização

- `src/`, `src_assets/`: servidor e integração nativa Windows/Linux.
- `dashboard/src/routes/`: rotas por arquivos; a árvore gerada não é editada à mão.
- `dashboard/src/pages/`: composição das telas.
- `dashboard/src/features/`: contratos e regras de configurações, aplicativos e dispositivos.
- `dashboard/src/components/ui/`: primitivas do registro oficial shadcn/Base UI.
- `dashboard/src/lib/`: HTTP, cache, arquivos e limites compartilhados.
- `dashboard/scripts/`: build e ensaios de integração.
- `tools/release/`: auditorias de ZIP/instalador e metadados.

Use os tokens semânticos existentes. Componentes próprios compõem comportamento;
não substituem primitivas disponíveis no registro nem criam outro design system.
As adaptações locais das primitivas mantêm rótulos pt-BR, associação de labels,
fieldset semântico, foco dos diálogos e comportamento de navegação móvel. Biome
continua habilitado também nesses arquivos.

O dashboard preserva o design aprovado. O link nativo **Pular para o conteúdo**
fica oculto até receber foco e leva o teclado ao conteúdo abaixo do cabeçalho.
O destino não adiciona uma parada ao percurso normal de Tab. Mudanças visuais além desse atalho
exigem autorização explícita; guidelines de design não autorizam um redesenho.

## Regressões

| Camada | Responsabilidade |
| --- | --- |
| Unitários (`dashboard/src/**/*.test.ts`) | validação, arquivos versionados, identidade, limites e serialização |
| Ferramentas (`dashboard/scripts/tests/`) | avisos consolidados, falhas de geração e ausência de caminhos locais nos artefatos |
| Navegador (`dashboard/tests/browser/`) | rotas, teclado, temas, responsividade, rascunhos, confirmação, erros e recuperação |
| Contratos C++/React (`tests/ui-contracts/`) | inventário e comportamento do parser nativo |
| HTTPS Windows | integração real de autenticação, configuração, PNG e reinício em runner isolado |
| Distribuição (`tools/release/`) | metadados, ausência de estado privado, arquivos web e igualdade ZIP/instalador |
| Instalador Windows | NSIS real com `/NoHostIntegration`, atualização da 1.0.0 e desinstalação preservando dados |
| Serviço Windows | helpers distribuídos do Apollo, preservação da conta e preferência de inicialização, reinício com novo processo respondendo |

Ao corrigir um defeito, acrescente uma regressão no nível em que ele ocorreu.
Teste o efeito observado e a ausência de gravações inesperadas, não apenas textos
ou um status HTTP. Exemplos e fixtures devem ser genéricos e não conter dados pessoais.

### Responsabilidade e limites

A política de gerenciamento de janelas em `src/window_management_policy.*` não
executa chamadas do sistema nem configura displays. Sua interface separa
coordenadas de tela e workspace, verifica a autorização da sessão/aplicativo e
calcula posicionamento limitado à área útil. A restauração exige identidade
completa da janela, geração correspondente, monitor de origem disponível e estado
atual igual ao efetivamente observado depois da movimentação. A ausência desses
dados não autoriza uma tentativa de recuperação.

`test_window_management_policy.cpp` executa essa mesma implementação nos contratos
nativos: geometrias negativas, taskbar superior/lateral, diferenças de DPI,
idempotência, janelas minimizadas/maximizadas, exclusões e rejeição de estado
obsoleto. Eventos de localização não autorizam movimentação. No modo Smart,
foreground/show exigem evidência recente de entrada remota, que é uma correlação,
não uma identificação infalível da origem da interação. Esses testes de política
não validam chamadas Win32, hooks, foco ou sessões reais de streaming.

`src/window_session_state.*` mantém a geração ativa, a coalescência de eventos e
o registro de movimentações em um único executor. Há limites de 256 eventos
pendentes e 512 registros; capacidade deve ser confirmada antes de mover uma
janela. Eventos repetidos não adiam indefinidamente o primeiro prazo. Encerrar a
geração invalida trabalho pendente; destruir uma janela retira sua identidade.
Mudanças posteriores ao estado confirmado invalidam a restauração, mesmo que a
janela volte depois à posição esperada. O consumidor deve revalidar janela,
destino e autorização antes de executar trabalho coletado da fila.

O resolvedor Windows em `src/platform/windows/window_target.*` usa somente
consultas: associa o nome exato recebido da criação do virtual ao device path do
monitor e atualiza sua área útil por essa identidade. Não usa monitor principal
ou proximidade como fallback. Rejeita associação ambígua em clone, destino
ausente e contexto DPI inadequado; a corrida de dimensionamento de buffers tem
tentativas limitadas. Os contratos Windows verificam rejeição de identidades
inválidas e ausência de fallback para identidades desconhecidas, não qualificam
o driver nem comprovam a topologia de uma instalação real.

Origens de restauração têm uma consulta distinta: um desktop lógico físico pode
ter vários targets em clone. Esse caso não autoriza usá-lo como destino virtual;
o resolvedor conserva um device path determinístico para a origem e consulta a
área lógica compartilhada, sem mudar caminhos ou modos.

`src/platform/windows/window_desktop.*` restringe inspeção/movimentação ao SID do
usuário interativo, à sessão de console ativa e ao desktop Default recebendo
entrada. Exclui janelas elevadas, integridade acima de medium, UIAccess,
processos protegidos, shell e auxiliares. O token SYSTEM do wrapper não amplia
essa política. Não há troca de desktop, ajuste de privilégios ou tentativa de
controlar UAC/Secure Desktop.

O executor mantém contexto DPI por thread e pequenas janelas próprias invisíveis
para consultar DPI com `GetDpiForWindow`. Não usa `GetDpiForMonitor` em contexto
per-monitor-aware nem muda o DPI global do host. Solicitações de posicionamento
revalidam identidade, estado, destino e responsividade; são assíncronas e não
significam movimentação concluída. O consumidor deve confirmar o resultado antes
de registrar ownership/restauração. Aplicações podem negar, ajustar ou atrasar a
operação; não se promete cancelamento atômico de uma solicitação já entregue ao
Windows nem suporte universal a aplicações não responsivas.

Os contratos de `test_window_desktop.cpp` criam somente janelas próprias. A falta
de sessão interativa/CCD é registrada como não testada, não contornada por drivers
ou alterações no runner. Com token elevado, os testes exercitam recusa, não
comprovam movimentação de janelas ordinárias; essa distinção fica nas propriedades
de resultado. DPI entre monitores, maximização em background e funcionamento com
aplicativos reais continuam exigindo validação Windows adequada.

Os contratos nativos incluem os testes de `input_packet.h` com os headers de
protocolo fixados: todos os eventos tratados pelo Apollo, cada truncamento,
tamanhos declarados incompatíveis, limites Unicode, eventos desconhecidos e bytes
desalinhados. O validador é o mesmo usado antes de permissões, fila e batching.
Eventos desconhecidos estruturalmente válidos e bytes excedentes do transporte
mantêm o comportamento anterior; isso não concede permissões de entrada.
`test_config_bool.cpp` executa o parser de produção sem inicializar o host e
protege as grafias aceitas, caixa mista, bytes altos e a regra legada de conter `1`.

As regressões estruturais em `test_repository_policy.py` complementam os testes
executáveis: exigem validação antes dos acessos tipados/fila e ownership COM dentro
de cada iteração da enumeração DXGI. Não simulam uma sessão de controle nem
comprovam comportamento de captura/driver. O build Windows verifica a integração
nativa; injeção de entrada, permissões durante streaming e enumeração física de
monitores ainda precisam de ambiente Windows isolado e autorizado.

Testamos o comportamento do Apollo, não os detalhes internos de bibliotecas ou
instaladores de terceiros. Hashes, presença de arquivos, validação antes de alterar
o sistema e tratamento de dependências indisponíveis são contratos do Apollo.
Integrações reais também importam, mas devem passar pela implementação do produto
e executar em um ambiente compatível, não por clientes SDK paralelos.

O CI hospedado verifica instalação de arquivos, atualização e dados com o modo
documentado `/NoHostIntegration`. O ciclo do serviço é testado separadamente pelos
helpers distribuídos, sem simular que esse caminho é uma instalação completa.
O host deve informar corretamente que o driver de display está indisponível.
Não instalamos drivers no CI hospedado nem adaptamos pacotes de fornecedores para
contornar restrições do sistema operacional.

`tools/tests/test_windows_installer.ps1 -HostIntegration` exercita o instalador
normal apenas em um runner Windows cliente descartável, autorizado e isolado do
fork. Esse modo não faz parte do workflow hospedado. Ele verifica a integração do
Apollo com o driver instalado; não certifica o código do fornecedor. Instalação
completa Windows 10/11, streaming, controles, HDR e matriz de hardware exigem
evidência no ambiente adequado. Não os declare aprovados por mocks ou CI parcial.

Antes de acrescentar infraestrutura ou um teste, identifique o contrato do produto
que precisa ser protegido. Prefira regressões comportamentais pequenas. Uma falha
deve ser diagnosticada antes de alterar código; não acrescente tentativas
especulativas, dependências de sistema ou flags exclusivas de teste ao produto.
Diagnósticos temporários não viram documentação permanente. Os critérios estão
registrados no [AGENTS.md](../AGENTS.md). Não altere um host ativo para testar.

## Dependências e distribuição

O [glossário](../GLOSSARY.md) define payload público, manifesto de instalação e
contrato de runtime. A política de caminhos em `tools/release/public_payload.py`
é compartilhada pelo gerador do manifesto e pelo auditor do ZIP. Os consumidores
mantêm suas próprias verificações de links, inventário e bytes; compartilhar a
política não substitui a conferência independente do artefato.

Os caminhos de distribuição também devem ser inequívocos no Windows: aliases com
ponto/espaço final, nomes de dispositivo, caracteres proibidos e colisões de caixa
são rejeitados, não normalizados para gravar em outro destino. A comparação do
instalador exige o mesmo conjunto de arquivos de programa do ZIP. O namespace de
controle `$PLUGINSDIR` do NSIS pode aparecer na mesma raiz de extração do 7-Zip:
somente nomes conhecidos são classificados como controles, e as cópias embutidas
dos scripts/manifesto devem coincidir com os arquivos públicos. `Uninstall.exe` é
um controle gerado, ausente no ZIP, cuja estrutura PE é verificada. Arquivos extras
do programa e controles desconhecidos continuam sendo rejeitados.

O atualizador usa um único orçamento para solicitar a parada do serviço proprietário
e aguardar serviço/host. Não força término nem para dependências de outra instalação.
Regressões de timeout usam stand-ins e nunca controlam o serviço de uma máquina ativa.

Diagnóstico NVENC distingue timeout, falha Win32 e retorno inesperado da espera,
sem alterar os 100 ms ou a recuperação. Os testes Windows usam eventos locais, não
um encoder ou driver. O timer de packetização/envio local coleta uma amostra após
todos os blocos FEC de um frame; não mede trânsito pela rede. Sua posição possui
uma regressão estrutural, complementada pelo build nativo, não um benchmark de rede.

`LICENSE` é a licença do Apollo. `NOTICE` contém atribuições que acompanham o código.
O build gera um único `NOTICE.txt` para as dependências do frontend, preservando os
textos instalados e omitindo caminhos locais. Não são necessários documentos de
proveniência por componente nem cópias manuais de cada licença no pacote fonte.

Atualizações de dependência devem ser intencionais, com lockfile e testes no mesmo
commit. Não mova tags publicadas nem substitua binários de uma release durante
manutenção do repositório.

Falhas da suíte `dashboard/tests/browser` preservam screenshots e traces em
`dashboard/test-results`; o CI os publica como diagnóstico temporário, sem retries
automáticos. Esses testes usam fixtures genéricas. Traces podem conter respostas
e dados de formulário: não use contas ou uma instalação real nesses ensaios.
