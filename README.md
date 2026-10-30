# Apollo 1.0.3

Host de streaming para [Artemis](https://github.com/ClassicOldSong/moonlight-android),
com painel React em português, display virtual no Windows e gerenciamento de
aplicativos, configurações e permissões de dispositivos.

Este é o fork [matheuspergoli/Apollo](https://github.com/matheuspergoli/Apollo),
baseado no [Apollo de ClassicOldSong/SudoMaker](https://github.com/ClassicOldSong/Apollo)
e no Sunshine. Créditos e licenças originais permanecem preservados.

## Downloads

Use os arquivos desta distribuição em
[Releases](https://github.com/matheuspergoli/Apollo/releases).

Use a **1.0.3**, que mantém a correção dos binários SudoVDA ausentes na 1.0.0. Atualize na
mesma pasta, com backup privado dos dados, sem desinstalar primeiro a versão antiga.
Veja as [notas da versão](docs/releases/v1.0.3.md).

- **Windows x64 — ZIP:** extração manual; não instala serviços nem drivers por si só.
- **Windows x64 — instalador:** instalação convencional, com integração de serviço,
  firewall e drivers. Executá-lo pode alterar a instalação existente; faça backup antes.
- **Linux:** código e build mantidos. Esta versão não anuncia pacotes binários Linux
  ou validação de todas as distribuições/GPU.

Pacotes de outros repositórios, WinGet e Chocolatey não são esta distribuição.
Confira o `SHA256SUMS.txt` da release. Não há promessa de assinatura Authenticode;
nunca desative mecanismos de segurança para ignorar um alerta de procedência.

## Atualização segura

1. Faça backup dos dados da instalação atual, especialmente configuração, aplicativos,
   estado de pareamento e credenciais. Não compartilhe esse backup.
2. Encerre o stream e o host anterior. Não execute dois hosts simultaneamente.
3. Para atualização manual por ZIP, extraia em uma pasta nova. Preserve seus dados;
   não os substitua pelos padrões do pacote. O agente não transfere nada automaticamente.
4. Inicie o host manualmente e acesse o endereço HTTPS indicado no log.
5. Entre novamente: o cookie de autenticação é específico da porta do host.

O instalador possui ações próprias para serviço, firewall e drivers. A auditoria
compara seu conteúdo ao ZIP sem executar a instalação; o usuário decide quando instalar.

## Painel

- Visão geral com informações do host, configurações salvas e aplicativo atual.
- Biblioteca de aplicativos com capas PNG e leitura periódica de estado.
- Configuração completa: **99 campos em 11 seções de Windows/Linux**. No Windows,
  aparecem **10 seções**; a seção adicional VA-API pertence ao Linux.
- Templates, exportação de valores salvos e importação revisada por seção ou global.
- Arquivos individuais de aplicativo e permissões, sem transferir identidade/pareamento.
- Reinício confirmado, protegido contra rascunhos e operações pendentes.
- Diagnóstico com logs e atualização explícita das informações do host.

Importar só altera o rascunho. Gravar exige salvar; comandos não são executados pela
importação. Arquivos de configuração não são backup de conta, pareamentos ou aplicativos.
Exportações podem conter caminhos e comandos privados: revise antes de compartilhar.

## Sistemas e drivers

Windows é a plataforma principal. Linux mantém os backends e opções existentes,
mas o display virtual SudoVDA é específico de Windows.

- **SudoVDA:** cria o monitor virtual da sessão.
- **ViGEmBus:** disponibiliza controles de videogame virtuais; não cria monitores.

HDR, codecs e modos disponíveis dependem da GPU, driver, monitor e cliente.
Confira as estatísticas da transmissão no Artemis. O painel não mede latência
de ponta a ponta e esta versão não promete ganhos de desempenho não medidos.

## Documentação e desenvolvimento

- [Instalação e uso](docs/getting_started.md)
- [Desenvolvimento e testes](docs/development.md)
- [Painel e formatos JSON](dashboard/README.md)
- [Compilação](docs/building.md)
- [Configuração nativa](docs/configuration.md)
- [Correções de relógio](docs/clock-corrections.md)
- [Contribuição](docs/contributing.md)

O painel usa React/TypeScript, TanStack Router/Query, Tailwind e shadcn/Base UI.
Os testes, ensaio HTTPS Windows e auditorias de pacote são executados pelo CI.

## Suporte e licença

Relate problemas deste fork em
[Issues](https://github.com/matheuspergoli/Apollo/issues), informando versão e passos
de reprodução. Remova senhas, tokens, certificados e dados privados dos logs.

Licença [GPL-3.0](LICENSE). Atribuições obrigatórias ficam em [NOTICE](NOTICE) e são
consolidadas no pacote. O histórico e a autoria das contribuições foram preservados.
