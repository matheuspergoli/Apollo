# Cortes breves de áudio: investigação controlada

## O que sabemos

O usuário relatou cerca de dois cortes breves de som em uma gameplay completa
com o candidato `9209dde`. O sintoma já ocorria antes da migração React. O log
mostra streaming AV1 de 10 bits/HDR, pedido de 1080p120 e 100 Mbps, áudio Opus
estéreo a 48 kHz e algumas recriações do encoder de vídeo. Não temos os instantes
dos cortes, estatísticas do Artemis ou medição de FPS/latência efetivamente obtidos.

Isso não basta para atribuir a causa ao encoder, à rede, à captura de áudio ou ao
cliente. `Starting async encoder teardown` indica limpeza de uma sessão de vídeo;
não é, por si, registro de falha de áudio ou prova de travamento da GPU.

O capturador Windows já registra `Audio capture signaled buffer discontinuity`
no nível debug e `Audio capture buffer overflow` como aviso, em
`src/platform/windows/audio.cpp`. Um log no nível Info não inclui a primeira
mensagem: sua ausência não comprova ausência de descontinuidade.

## Próxima coleta, somente quando conveniente ao usuário

1. Mantenha as mesmas condições do teste e registre o horário/segundo relativo à
   conexão em que ouvir o corte. Anote se houve travada de imagem ao mesmo tempo.
2. Confira se o som também corta na reprodução local do PC ou somente no Artemis.
   Informe a saída de áudio do cliente (alto-falante, fone com fio ou Bluetooth).
3. Guarde as estatísticas do Artemis desse intervalo: perdas de rede, frames
   descartados, jitter/latências de decode/render que a versão disponibilizar.
4. Compare esse instante com as recriações do encoder e mensagens de áudio.
   Se necessário, faça uma coleta **curta** no nível de depuração no host de teste;
   volte ao nível normal depois. Debug pode gerar muito log, conter dados privados
   e alterar a carga do sistema. Não publique arquivos completos sem revisão.

## Comparações opcionais, uma variável de cada vez

- Primeiro compare local versus remoto, sem mexer em drivers, buffers ou formatos.
- Se o problema for apenas remoto, um teste com bitrate menor (por exemplo,
  40 Mbps em vez de 100), mantendo codec, resolução, FPS e HDR, pode ajudar a
  investigar sensibilidade à carga da rede. É um ensaio, não promessa de correção.
- Se necessário, compare 60/120 FPS em ensaios separados, mantendo o restante.
- Para comparar com o host anterior, alterne os processos; nunca rode dois hosts
  disputando GPU/displays e não sobrescreva suas configurações originais.

Não aplicar ajustes genéricos de HAGS, prioridade, drivers ou latência de áudio
antes de correlacionar os eventos. A funcionalidade de exportação global serve
para registrar os campos de configuração, não captura métricas nem exporta os
arquivos privados necessários a um backup completo da instalação.
