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

## Imagem, áudio e rede

Separe captura, codificação, transporte e decodificação usando os logs e as
estatísticas do cliente. Compare com uma sessão local, outra resolução ou bitrate,
alterando uma variável por vez. Não atribua cortes de áudio a um erro de vídeo sem
correlacionar os eventos.

No Windows, descontinuidades de áudio aparecem no nível debug e overflow como
aviso. Coletas de debug devem ser curtas: aumentam a carga e podem conter dados
privados. Ausência de debug em um log Info não comprova ausência do evento.

Não abra portas, remova regras de rede, conceda acesso a um disco inteiro ou altere
drivers/HAGS/prioridades sem diagnóstico específico e um caminho de recuperação.

## Linux

Verifique o backend de captura, os codecs disponíveis e as permissões dos dispositivos
na sua distribuição. Regras udev, KMS, Mesa, NVIDIA e compositores variam por ambiente.
Não aplique remoção de capabilities, associação a grupos de entrada ou alterações
de rede como solução universal. Consulte [compilação](building.md) e a documentação
do componente envolvido. O SudoVDA não é um backend de display Linux.
