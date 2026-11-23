# Instalação e uso

O Apollo executa no computador que transmite a sessão. Windows é a plataforma
principal; Linux mantém os backends existentes. O dispositivo cliente usa Artemis.

## Download

Baixe os pacotes em [Releases deste fork](https://github.com/matheuspergoli/Apollo/releases)
e confira o SHA-256 publicado. Pacotes de outros repositórios ou gerenciadores não
são necessariamente esta distribuição. Os arquivos não têm promessa de assinatura
Authenticode; não desative proteções para ignorar um alerta de procedência.

## Windows

O ZIP permite extração e execução manual. O instalador oferece integração com
serviço, firewall e drivers; executá-lo pode alterar uma instalação existente.
Leia as opções e faça backup dos dados antes de atualizar.

1. Encerre o stream e o host anterior. Não execute dois hosts disputando GPU e displays.
2. Para atualização manual, extraia o ZIP em uma pasta nova. Preserve configuração,
   biblioteca, credenciais e estado de pareamento; não os substitua por padrões.
3. Inicie `sunshine.exe` manualmente ou use o serviço instalado, não ambos.
4. Abra o endereço HTTPS indicado no log. A porta do painel é a porta base + 1.
5. Na primeira utilização, crie as credenciais administrativas e entre no painel.

Os dados Windows ficam no diretório `config` ao lado do executável. Esse diretório
pode conter segredos: não o publique nem o incorpore em um ZIP de distribuição.

### Atualização a partir da linha 1.0

Use a revisão corretiva 1.0.1 ou posterior na mesma pasta, sem executar primeiro
o desinstalador antigo. O instalador interrompe somente o serviço pertencente à
instalação escolhida, cria um backup privado em `<diretorio>.backups` e preserva
os arquivos de configuração, aplicativos, credenciais e pareamento. Não há mudança
de formato desses dados nesta revisão. Serviço desabilitado/parado não é
reativado às cegas. Dados antigos fora de `config` e diretórios com links exigem
migração/backup explícitos; uma situação ambígua interrompe a atualização.

Não apague o backup até conferir o funcionamento. Ele contém dados privados e não
é um pacote de distribuição. O arquivo de configurações exportado pelo painel
não substitui esse backup integral. Drivers compartilhados não são removidos na
desinstalação do Apollo, e o instalador não força reinício do Windows.

SudoVDA cria o display virtual. ViGEmBus disponibiliza controles virtuais; não cria
monitores. Instale ou altere drivers apenas por uma decisão explícita, com acesso
local para recuperação.

## Linux

Consulte [building.md](building.md) para compilar. Esta distribuição não anuncia
binários Linux ou validação de todas as distribuições, GPUs e métodos de captura.
O display virtual SudoVDA é específico de Windows.

As receitas auxiliares de pacote e contêiner exigem validação no ambiente de destino;
não equivalem a imagens ou pacotes mantidos em um repositório público de distribuição.

## Pareamento e aplicativos

Adicione o endereço do host no cliente e conclua o pareamento pelo painel. Revise
as permissões de cada dispositivo. Desconectar mantém o pareamento; desvincular o remove.

Cadastre aplicativos com comandos e caminhos conhecidos. Revise comandos de
preparação/desfazer antes de salvar ou iniciar uma sessão.

### Scripts PowerShell

No Windows, **Aplicativos → Scripts** permite adicionar arquivos `.ps1` à
biblioteca do host. No editor de aplicativo, use **Usar script** na inicialização,
nas etapas de preparação/desfazer, nos eventos de sessão ou em comandos desanexados.
Selecione a versão, confira o conteúdo e informe os argumentos em campos separados.
Salvar vínculos novos ou alterados exige revisão.

Cada vínculo usa uma versão fixa. Adicionar uma nova versão à biblioteca não
atualiza os aplicativos existentes. A opção **Permitir execução neste processo**
usa Bypass somente na chamada do PowerShell, sem alterar a política permanente
do Windows; Políticas de Grupo prevalecem. Deixe desativada se não for necessária.

Scripts desanexados não encerram com o aplicativo: devem definir seu próprio
critério de saída. Para voltar a um comando escrito no editor, use
**Usar comando manual**.

Para abrir no Artemis do celular, escaneie o QR exibido no painel.

## Configurações e arquivos

O painel mostra os valores salvos e identifica ajustes que exigem reinício. Salvar
e reiniciar são ações diferentes. Importar configurações apenas altera o rascunho;
revise as diferenças e salve explicitamente.

Templates contêm padrões, não uma cópia da instalação. Uma importação pode alterar
portas, caminhos ou comandos se esses campos estiverem presentes. Exportações
podem conter dados privados e não são backup de conta, pareamento ou certificados.
Configurações exportam valores salvos no host; aplicativos e dispositivos exportam
o rascunho do editor, incluindo alterações não salvas.

O template de aplicativo usa comandos manuais. Para transportar um aplicativo com
scripts gerenciados, configure os vínculos no editor e exporte o aplicativo:
o pacote inclui os arquivos, argumentos e política por vínculo. Importe pelo mesmo
controle, revise e salve para criar cópias locais. Executáveis, módulos e arquivos
externos usados por eles continuam dependendo do host de destino.
Os formatos e controles estão documentados em [dashboard/README.md](../dashboard/README.md).

## Acesso e diagnóstico

Um 401 significa acesso não autorizado, não necessariamente expiração por tempo.
O host mantém uma sessão administrativa por processo. Reiniciar, trocar credenciais
ou fazer outro login pode invalidar o acesso anterior. Entre novamente quando solicitado;
a recuperação não repete comandos rejeitados automaticamente.

O diagnóstico atualiza versão, driver e captura configurada. As estatísticas da
transmissão devem ser conferidas no Artemis. Para investigar falhas, registre o
horário, comportamento esperado e observado e um trecho de log sem segredos.
Veja [troubleshooting.md](troubleshooting.md). Nunca publique senhas, tokens ou chaves.
