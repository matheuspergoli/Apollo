# Diagnóstico

Registre versão, horário, etapa e mensagem final. Compare o comportamento observado
com as estatísticas do Artemis e os logs do Apollo. Remova senhas, tokens, certificados
e caminhos privados antes de compartilhar. Não reinstale componentes nem altere
várias opções simultaneamente como tentativa genérica de reparo.

## Atualização e serviço

`Waiting for service 'Apollo Service (ApolloService)' to stop...` é uma mensagem
do PowerShell enquanto aguarda a parada do serviço. Isoladamente, não significa
falha e não explica a causa da demora. Aguarde a conclusão; os arquivos precisam
ser liberados antes de serem substituídos.

Se houver erro final, timeout ou o instalador não concluir, interrompa as tentativas
e preserve o backup privado. Não desinstale para reparar às cegas. Consulte
[instalação e atualização](getting_started.md) e as [notas da versão](changelog.md).

## Painel e autenticação

Confira no log o endereço HTTPS e a porta configurada. Um 401 indica falta de
autorização; reiniciar, trocar credenciais ou fazer outro login pode invalidar
a sessão anterior. Entre novamente, sem repetir automaticamente operações de gravação.

Para recuperar credenciais, consulte a opção `--creds` na ajuda do executável da
instalação correta, com o host encerrado. Não apague `config` nem arquivos de
pareamento. Evite expor a nova senha em histórico de terminal ou logs compartilhados.

## Display virtual e controles

SudoVDA fornece o display virtual; ViGEmBus fornece controles. São integrações
distintas. Confira o estado no painel, o Gerenciador de Dispositivos e os erros
do instalador. Arquivos presentes no disco não comprovam que um driver está pronto.
Não desative a verificação de assinatura nem obtenha drivers de espelhos não verificados.

Se o controle aparece no Windows mas não no jogo, confira a configuração de entrada
do jogo e do Steam e possíveis controles concorrentes. Não remova dispositivos
ou drivers compartilhados indiscriminadamente.

## Janelas da sessão

Uma janela já pode ter mudado de estado durante a preparação do display, antes
da primeira movimentação do WSM. O Windows também pode aplicar posições salvas
quando o monitor virtual sai, depois da restauração confirmada pelo gerenciador.
Por isso, `Falhas = 0` e `Restauradas > 0` não comprovam o estado final depois de
toda a desconexão. Uma janela encoberta por outra não comprova minimização.

As preferências do Windows para lembrar posições por monitor e minimizar na
desconexão são independentes da restauração do Apollo. Não altere duplicação,
Registro ou drivers para contornar esse comportamento. Consulte o
[alcance e os limites do gerenciamento](configuration.md#windows-window-location-memory)
antes de atribuir a mudança ao WSM ou considerar uma alteração global como reparo.

## Imagem, áudio e rede

O Apollo captura e codifica a imagem no host; o cliente decodifica a transmissão.
O encoder AMD usa AMF. Uma falha de inicialização do encoder não comprova defeito
no driver, na captura ou no decoder do cliente.

Separe captura, codificação, transporte e decodificação usando os logs e as
estatísticas do cliente. Compare com uma sessão local, outra resolução ou bitrate,
alterando uma variável por vez. Não atribua cortes de áudio a um erro de vídeo sem
correlacionar os eventos.

No Windows, descontinuidades de áudio aparecem no nível debug e overflow como
aviso. Coletas de debug devem ser curtas: aumentam a carga e podem conter dados
privados. Ausência de debug em um log Info não comprova ausência do evento.

Não abra portas, remova regras de rede, conceda acesso a um disco inteiro ou altere
drivers/HAGS/prioridades sem diagnóstico específico e um caminho de recuperação.

### Encoder e painel indisponível

Confira a GPU detectada, o encoder selecionado e a última etapa do log. Falhas na
detecção inicial podem impedir a abertura do painel. `Found … encoder` confirma a
detecção, não a estabilidade de uma transmissão. Valide também encerramento e
reconexão pelo cliente.

Se precisar recuperar o painel sem usar o encoder de hardware, preserve o log,
pare o serviço e salve `encoder = software` no arquivo de configuração da
instalação. Reinicie o serviço. Se a instância estiver presa e não parar, salve
seu trabalho e reinicie o Windows para carregar a configuração. O modo software
é temporário; reinstalar não é necessário para aplicar essa alteração.

Para uma coleta curta, selecione Depuração (`min_log_level = 1`). O log registra
etapas de dispositivo, sessão, primeiro pacote e liberação dos recursos. Depois
da coleta, volte a Informação (`min_log_level = 2`). Preserve o trecho antes de
outra inicialização e remova dados privados antes de compartilhar.

## Scripts de aplicativos

- **Execução bloqueada pela política:** confira o erro do PowerShell e a opção
  **Permitir execução neste processo** do vínculo. Não altere a política global
  como tentativa genérica de reparo; Políticas de Grupo continuam valendo.
- **Versão ou script indisponível:** escolha um script e uma versão existentes.
  Adicionar uma versão à biblioteca não atualiza os vínculos antigos.
- **Integridade ou proteção do arquivo recusada:** não edite o armazenamento
  interno nem afrouxe suas permissões. Importe uma cópia confiável pela biblioteca.
- **Falha em um comando desanexado:** confira no log o ID, a revisão e o código de
  saída. Use o campo **Arquivo de saída** do aplicativo para registrar erros do
  PowerShell. Sucesso na inicialização do processo não comprova sucesso do script.
- **Script continua após encerrar o aplicativo:** comandos desanexados são
  independentes; o script precisa de um critério de saída próprio.

Arquivos devem ser ASCII ou UTF-8 com BOM quando contêm acentos, com até 128 KiB.
Argumentos são literais, sem aspas duplas ou quebras de linha; caminhos, módulos
e executáveis usados pelo script precisam existir no host.

## Linux

Verifique o backend de captura, os codecs disponíveis e as permissões dos dispositivos
na sua distribuição. Regras udev, KMS, Mesa, NVIDIA e compositores variam por ambiente.
Não aplique remoção de capabilities, associação a grupos de entrada ou alterações
de rede como solução universal. Consulte [compilação](building.md) e a documentação
do componente envolvido. O SudoVDA não é um backend de display Linux.
