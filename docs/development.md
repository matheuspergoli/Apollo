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

Para retorno rápido sem iniciar um host nativo, execute `pnpm check`,
`pnpm typecheck` e `pnpm test`. Os testes do exportador e o ensaio HTTPS Windows
usam o mesmo contrato de inventário de seções, campos e documentos do ZIP,
derivado do schema; ele rejeita omissões e arquivos privados extras. O workflow
Windows executa essas verificações antes das dependências/compilação nativas e
executa HTTPS antes do ciclo de instalador/serviço. Nenhuma dessas antecipações
substitui o restante da qualificação.

O contrato de navegador em `dashboard/scripts/browser-contract.mjs` verifica,
após uma navegação completa, que a folha de estilo local foi carregada e que os
tokens de tema estão aplicados. O ensaio HTTPS nativo usa a mesma verificação
exercitada pelos testes rápidos, inclusive com falha de CSS injetada. Um heading
renderizado ou um botão habilitado não comprova que a interface está utilizável
sem estilos. Uma falha de recurso continua falhando o ensaio: não se contorna uma
camada modal com clique forçado, alteração do fornecedor ou repetição automática
de ações. O mock de transporte não qualifica TLS nem o servidor nativo.

O endpoint autenticado `/api/logs` lê o arquivo em modo binário, sem interpretar
bytes de controle como fim do arquivo. No Windows, uma leitura em modo texto pode
parar em SUB (`0x1a`) e ocultar registros posteriores mesmo com gravação correta.
O ensaio HTTPS isolado gera esse byte pelo logging real do host, aguarda de forma
limitada a gravação dos marcadores e exige que uma nova leitura retorne o marcador
completo e um registro posterior. Não altera arquivos de uma instalação existente
nem usa um leitor paralelo para substituir o endpoint. A leitura direta da fixture
apenas confirma que o produtor já gravou os dados antes de testar o consumidor.
Na interface, `Atualizar log` faz uma nova leitura; `Atualizar estado` do WSM atualiza
somente o status de janelas. O log não é apresentado como um stream em tempo real.

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

`src/window_session_controller.*` executa descoberta e confirmações em lotes
limitados. A interface `window_backend` é usada tanto pelo adaptador Win32 quanto
pelos testes com conclusão atrasada: aceitar uma solicitação não incrementa a
contagem de movimentos nem autoriza restauração. É necessário observar a mesma
identidade, posição, estado e destino dentro do prazo. Mudança manual, suspensão
de autorização e perda do destino invalidam trabalho ou ownership; recuperação
manual explícita pode estabelecer uma nova origem. O encerramento tem um prazo
único e não considera uma conclusão observada depois dele como sucesso.

A regressão de recuperação manual cobre uma janela inicialmente maximizada,
devolvida manualmente ao monitor físico e deixada normal ou maximizada novamente.
Sem recuperação explícita, foreground não a recolhe; após recuperação, a restauração
confirmada usa a geometria e o estado dessa nova origem, não o snapshot inicial.
Outra janela permanece minimizada e não recebe solicitações. Esse contrato do
controlador não simula o arraste Win32, foco, Z-order ou ativação pela taskbar.

Os contadores pertencem à geração de gerenciamento, não ao histórico do host nem
ao número de aplicativos distintos. `moved`/`restored` exigem confirmação;
`failed` inclui confirmações e trabalho incompleto; `skipped` inclui tentativas
não submetidas e restaurações recusadas, mas não é um censo de todas as janelas
inelegíveis. Os diagnósticos de enumeração, inspeção, submissão, confirmação,
destino e restauração são ocorrências que podem se sobrepor. Uma inspeção
recusada não prova que uma movimentação foi submetida ou falhou.

Na inspeção Win32, `window_session`/5 é uma recusa agregada de identidade de
thread/processo, consulta/igualdade de sessão ou desktop de entrada. Não identifica
qual dessas condições falhou. `normal_geometry`/13 é atribuído pelo Apollo quando
não consegue converter o retângulo restaurado de workspace para tela com a área
de origem; não é um código retornado por `GetWindowPlacement`. Pode incluir
retângulo degenerado, overflow ou área de monitor inválida. Esses resumos não
identificam a janela nem a causa específica e não autorizam relaxar a validação.

`last_error` é o código Win32 associado a `diagnostics.last_operation` e
`last_reason`, não um código independente a ser atribuído a todas as falhas.
Um timeout ou outra falha sem código nativo zera esse campo, sem herdar o erro de
uma inspeção anterior. A última observação antes de um timeout distingue estado,
geometria ou destino divergente de ausência de conferência; ela não prova que o
aplicativo recusou a operação nem permite relaxar a confirmação. Não se incluem
títulos, nomes de processos ou caminhos privados de janelas nesses diagnósticos.

O último movimento/restauração sem confirmação possui um resumo separado e
limitado, preservado mesmo após novas falhas de inspeção. Inclui etapa, código,
estado solicitado e número de conferências executadas, sem identificadores de
janelas. Contadores de timeout distinguem ausência de conferência de divergência
observada de estado, geometria ou monitor; quando várias divergências coexistem,
a classificação prioriza estado, depois geometria e depois destino. A soma
dessas categorias corresponde aos timeouts, não a todas as falhas. Zero
conferências não prova que o aplicativo recusou o movimento. Uma etapa de acesso
negado não autoriza remover a restrição de segurança nem elevar o gerenciador.

A página Configurações contém opções persistidas e seleção de aplicativo. Estado WSM,
contadores, diagnósticos e recuperação manual pertencem à página Diagnóstico;
consultar ou editar configurações não inicia polling do estado WSM. O seletor
usa o inventário de aplicativos, independentemente da disponibilidade dos
diagnósticos. Uma confirmação HTTP de recuperação não acompanha gerações futuras
nem permanece apresentada como solicitação da sessão ativa após seu encerramento.

Após suspensão, `recovery_required` recomenda uma descoberta manual explícita;
retornar a `active` não readquire ownership. O aviso é retirado quando o
controlador aceita a descoberta manual, não apenas porque o HTTP enfileirou a
solicitação. Isso não garante movimentação ou restauração de toda janela. Uma
alteração manual isolada continua protegida e não gera automaticamente esse
aviso de interrupção. O worker registra transições/resumos por geração no log,
sem emitir uma linha para cada evento ou consulta do painel.

Os resumos de ciclo de vida incluem `confirmed_total` e as últimas 16 operações
confirmadas, em ordem, com sequência, número anônimo de janela e estados anterior,
solicitado e observado. O número é a incarnation local do executor, não HWND/PID;
não inclui títulos ou caminhos. A mesma sequência pode reaparecer em resumos
posteriores da geração. O total explicita a perda das entradas mais antigas;
submissão sem confirmação não entra nesse histórico. Ruído de inspeção não o apaga
e uma nova geração começa sem histórico. Isso distingue restauração confirmada em
estado normal de maximizada, mas não observa mudanças posteriores ao encerramento
do WSM nem comprova qual componente as provocou durante o teardown do display.

`src/window_runtime_state.*` coordena associação de streams, exclusividade,
permissões e gerações por uma interface de executor. Os testes exercitam essa
implementação de produção com executor controlado: mensagens de uma geração
antiga não afetam a nova, entrada recente não é herdada, streams adicionais
retiram autorização e um executor que não encerrou impede sua substituição.
Isso não comprova a entrega dos eventos de ciclo de vida por uma sessão real.

A evidência de entrada é vinculada também ao stream proprietário, não só à
geração compartilhada. Perda de exclusividade/permissão troca seu armazenamento;
um pacote tardio pode terminar de escrever no estado aposentado, mas não concede
evidência ao stream sobrevivente nem ao proprietário reautorizado. Isso não muda
o protocolo de entrada nem atribui evidência a pacotes recusados.

O adaptador `src/platform/windows/window_worker.*` mantém hooks e message loop
na mesma thread, com fila fixa e processamento limitado. O callback não inspeciona
nem move janelas; perda de evidência por overflow invalida o gerenciamento.
Suspensão de desktop/permissão invalida movimentos pendentes e ownership anterior.
Cancelamento e revisão da captura são conferidos antes da submissão nativa;
solicitações já entregues ao Windows não podem ser canceladas atomicamente.
O prazo de encerramento começa no chamador. Em timeout, o estado e os callbacks
permanecem vivos até a thread sair, e o runtime recusa outro worker nesse intervalo.
Testes portáteis do controlador/runtime não qualificam hooks, captura nem esse
ciclo de thread Win32; a integração nativa requer build e ambiente Windows.

Os 750 ms de orçamento de restauração e 1.000 ms de espera do worker não são uma
garantia de cancelamento das chamadas Win32 em andamento. Uma retomada da captura
depois de interrupção não restaura a evidência anterior. Desconexão de rede pode
acionar o ciclo existente de remoção/recriação do virtual; ausência de qualquer
reenumeração não é um contrato. Nenhum desses caminhos autoriza o WSM a mudar
modos, duplicação ou disposição dos monitores físicos.

Após movimento confirmado, início de arraste ou divergência observada de posição/estado
invalida a propriedade daquela janela. O controlador não submete restauração
para ela, mesmo se outro aplicativo aparecer no destino ou receber foreground.
Uma recusa intencional por `ownership_lost` pode incrementar restaurações não
submetidas sem indicar falha: a escolha manual tem prioridade. O teste combinado
do controlador verifica retorno manual ao monitor físico, geometria/estado
preservados e ausência de ownership para outra janela exibida externamente.
Não simula foco, Z-order ou minimização provocada pela retirada do monitor virtual.
Uma janela encoberta por outra não comprova minimização; contadores durante a
sessão não comprovam restauração depois de desconectar. Para atribuir a operação
ao WSM, compare também os resumos `WSM:` da geração encerrada com a ordem dos
eventos de teardown do display. Uma reposição feita pelo Windows após esse
teardown não vira sucesso retroativo do gerenciador.

Os chamadores de produção associam a geração ao lançamento/retomada e ao stream,
antes de iniciar as threads de captura. Encerrar a sessão retira sua associação;
encerrar o aplicativo aguarda o orçamento do WSM antes de comandos de undo e
remoção do virtual. Preparar novamente a mesma sessão viva não recria o worker.
Cada stream conserva sua própria origem capturada: a saída de um stream não pode
autorizar movimentos usando a origem de outro.

`display_base.cpp` publica o `DeviceName` da saída DXGI realmente selecionada.
Os caminhos síncrono/assíncrono sinalizam prontidão depois de preparar a sessão
de encoder e retiram essa evidência em teardown/reinit, não a cada frame.
Offsets normalizados de captura não são usados como coordenadas globais ou
identidade de monitor. O WSM compara a origem capturada com a identidade estável
já escolhida pelo Apollo, sem consultas de fallback físico.

A descoberta inicial ocorre depois da preparação do display e da prontidão da
captura. Seu estado inicial é o que o Windows informa nesse momento, não um
snapshot anterior à conexão. Encontrar uma janela no destino não comprova que o
WSM a moveu: não conta movimento nem autoriza restauração. Uma minimização entre
descoberta e execução invalida a elegibilidade da solicitação pendente. Os testes
do controlador exercitam esses dois contratos sem simular a preparação de displays.
Para isolar efeitos externos, compare a mesma sequência com o modo desativado
aplicado pelo host; mudanças visíveis nessa condição não comprovam ação do WSM.

`input.cpp` sinaliza atividade somente depois da validação estrutural e aceitação
da permissão do pacote. O classificador de produção é testado com os headers
fixados; eventos de controle de jogo e eventos desconhecidos não fornecem essa
evidência. Os testes portáteis não injetam entrada no sistema.

Configurações `wsm_*` usam parser estrito compartilhado pelo carregamento nativo
e pela validação de gravação HTTP. A seleção ausente não autoriza gerenciamento.
Os endpoints autenticados de estado e recuperação manual não recebem HWND,
geração ou destino do cliente. A integração HTTPS isolada verifica autenticação,
recusa sem sessão elegível e preservação do arquivo após configurações inválidas;
isso não qualifica movimentos reais nem a instalação do driver. Os testes de UI
verificam seleção por UUID, rascunhos, erros, ausência de replay de ações e
contadores fornecidos pelo host, sem inventar métricas de dispositivo.

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
de resultado e na saída textual do teste. Erros inesperados de consulta CCD
falham o teste, não são classificados como ambiente ausente. DPI entre monitores,
maximização em background e funcionamento com
aplicativos reais continuam exigindo validação Windows adequada.

O caso maximizado em segundo plano verifica também preservação de foco e de
Z-order quando a fixture é elegível. `SW_SHOWNA` mantém o estado corrente sem
ativação; não se reaproveita o comando ativador `SW_SHOWMAXIMIZED` nem se usa
`SW_SHOWNOACTIVATE`, que pode restaurar o estado normal. Com token elevado,
esse teste continua relatando apenas recusa, não qualificação de movimentação.

O caminho maximizado transfere também o quadro visível por `SetWindowPos`, com
`SWP_NOACTIVATE`, `SWP_NOZORDER`, `SWP_NOOWNERZORDER` e solicitação assíncrona.
O cálculo puro usa a área útil do destino e preserva os offsets de cada borda do
quadro em relação à área útil de origem, escalados uma vez pelo DPI. Não confunde
esse quadro com o retângulo restaurado, nem fixa bordas em pixels ou altera o
estado para normal/minimizado. Depois atualiza o retângulo restaurado com
`SetWindowPlacement`/`SW_SHOWNA`. As duas solicitações não são atômicas; falha ou
interrupção entre elas não autoriza ownership nem restauração corretiva automática.
A confirmação posterior continua exigindo estado, retângulo restaurado e monitor.
Os testes portáteis cobrem cálculo, área útil deslocada, DPI, ida/volta e recusa
de geometria inválida/overflow; não qualificam a execução das chamadas Win32.
O ensaio nativo adicional cria apenas janelas próprias e usa dois monitores
lógicos já existentes para conferir o quadro maximizado, o retângulo restaurado,
foco e Z-order na ida/volta. Sem esses monitores registra ausência de cobertura;
com token elevado verifica apenas recusa. Não instala drivers nem cria displays
para satisfazer o teste, e não substitui aceitação com aplicações reais.

`WINDOWPLACEMENT.rcNormalPosition` descreve a posição restaurada, não a posição
visível de uma janela maximizada. Conferir somente esse retângulo, inclusive em
um teste no mesmo monitor, não qualifica transferência entre monitores. O
controlador exige também a identidade do monitor observado. As referências
[WINDOWPLACEMENT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-windowplacement)
e [SetWindowPlacement](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowplacement)
documentam as coordenadas workspace e os ajustes que o Windows pode aplicar.
Não substitua essa confirmação por sucesso da chamada Win32 ou por um ciclo
automático de minimizar/restaurar. Esse contrato não resolve, por si só, a
movimentação de aplicações reais maximizadas.

**Critérios de resiliência do gerenciamento de janelas.** Retomar observação não
é o mesmo que recuperar ownership. Quando desktop, exclusividade, permissão e
captura do mesmo destino voltam a estar válidos, o worker pode voltar a processar
eventos. Isso não autoriza limpar `user_override`, reutilizar operações pendentes
ou repetir a recuperação inicial sobre todas as janelas. Janelas cuja evidência
anterior foi invalidada continuam exigindo recuperação manual na mesma geração
para estabelecer uma nova origem. Reiniciar automaticamente um worker também
não pode contornar essa proteção nem a quarentena de um executor que ainda não
terminou.

Uma nova enumeração não comprova continuidade de identidade depois de perder
eventos de criação/destruição: um HWND pode ser reutilizado dentro do mesmo
processo/thread, mantendo PID e horário de criação do processo. Por isso, uma
recuperação de overflow não pode preservar silenciosamente o ownership anterior.
A fila bruta WinEvent é distinta da fila de política, que já agrupa solicitações
por janela. Agrupar apenas notificações comprovadamente equivalentes exige
preservar ordem e barreiras de criação, destruição, início de movimento e troca de
desktop. Mesclar alterações de localização pode ocultar que uma janela saiu e
voltou à mesma posição, invalidando a proteção contra alterações posteriores.

A evidência Smart registra pacote validado e permitido antes de enfileirar a
injeção de entrada; não comprova que o Windows entregou esse pacote a uma janela.
Os hooks atuais não associam o horário original do WinEvent a um pacote
específico. Uma associação temporal mais restrita deve distinguir recebimento,
injeção e ocorrência/processamento do evento, inclusive atrasos de fila e ações
locais intercaladas. Nenhuma heurística temporal deve ser apresentada como prova
de autoria remota ou ampliar permissões. Gamepad não vira evidência de desktop
para compensar a ausência dessa associação.

Alterações nessas políticas precisam de regressões de produção para perda/retorno
de autorização, mudança manual durante interrupção, reutilização de identidade,
ordenação de eventos e ausência de replay. Restauração sob queda de rede exige
também captura/teardown reais em Windows: não pode recriar o display apenas para
restaurar, adotar outro destino nem recuperar ownership de uma geração anterior.
Cache de CCD, novos limites de fila e alterações de prazo exigem medições ou uma
reprodução; resultados de política com backend controlado não demonstram custo
de Win32 nem estabilidade de streaming sob carga.

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

A confirmação de inicialização usa o PID atualizado do serviço, exatamente um
processo filho pertencente à instalação, um endpoint na porta de configuração
pertencente a esse filho e uma conexão TCP efetivamente aceita nesse endereço.
O estado textual/numérico da tabela TCP não basta: um Windows pode informar
`Closed` para um endpoint que aceita conexões. Isso não autoriza aceitar `Closed`
isoladamente; uma porta apenas vinculada, sem escuta, deve falhar a conexão.
Um endpoint de outro processo não confirma a instalação. Serviço e filho são
revalidados depois da conexão para recusar substituição durante a conferência.
O probe tem até 250 ms por endereço dentro do orçamento restante e não envia
dados de aplicação, credenciais ou requisições HTTPS; não desabilita validação de
certificado. IPv4 e IPv6 são exercitados com sockets locais descartáveis no teste
do helper. A integração HTTPS permanece uma verificação separada do host real.
O orçamento de inicialização é medido por relógio monotônico; consultas CIM recebem
o tempo restante e as pausas não reiniciam o orçamento. Chamadas síncronas do Windows
podem exceder o tempo solicitado; isso não constitui garantia de prazo de tempo real.
Os testes cobrem confirmação imediata, identidades divergentes e orçamento esgotado.
Falhas com snapshot válido preservam o erro, a última observação de inicialização e
as últimas linhas do log padrão em uma subpasta privada do backup, antes de restaurar
arquivos anteriores. Logs personalizados não são procurados automaticamente.
A restauração dos arquivos e a confirmação do serviço anterior são etapas distintas;
uma falha na segunda não significa, por si só, perda dos arquivos restaurados.
O ensaio isolado do helper distribuído corrompe apenas o executável Apollo da
fixture depois da preparação, exige recusa antes de iniciar o programa, verifica
o diagnóstico persistido e restaura bytes, dados, preferência do serviço e login.
Isso exercita falha/rollback do helper; não simula timeout de dispositivo nem
qualifica a integração completa de drivers do wizard NSIS.

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
