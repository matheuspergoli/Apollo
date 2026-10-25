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

Cadastre aplicativos com comandos e caminhos conhecidos. Excluir uma entrada da
biblioteca não desinstala o aplicativo. Comandos de preparação/retorno podem alterar
o computador; revise-os antes de salvar ou iniciar uma sessão.

Abrir no Artemis usa o aplicativo instalado no dispositivo que abre o link. Um
link aberto no navegador do PC não manda o celular abrir o cliente remotamente.

## Configurações e arquivos

O painel mostra os valores salvos e identifica ajustes que exigem reinício. Salvar
e reiniciar são ações diferentes. Importar configurações apenas altera o rascunho;
revise as diferenças e salve explicitamente.

Templates contêm padrões, não uma cópia da instalação. Uma importação pode alterar
portas, caminhos ou comandos se esses campos estiverem presentes. Exportações
podem conter dados privados e não são backup de conta, pareamento ou certificados.
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
