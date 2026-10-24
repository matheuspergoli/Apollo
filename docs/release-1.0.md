# Apollo 1.0.0

## Escopo

Windows x64 é a plataforma principal. O código e os backends Linux foram mantidos;
não são anunciados binários Linux nem uma matriz de distribuições/GPU validada.
O produto não mantém outros backends de host. Dependências de terceiros e seus
avisos legais continuam intactos.

A interface é inteiramente React, em pt-BR, com oito entradas nativas. Não há Vue,
Bootstrap, seletor de idioma ou frontend paralelo. A `main` é a única branch do
fork; os históricos anteriores foram preservados antes da consolidação.

## Uso e configuração

São **99 campos em 11 seções de Windows/Linux**. No Windows, o painel mostra
**10 seções**; o formato completo inclui também VA-API, específica de Linux.
As contagens do painel e do guia exportado vêm do próprio schema.

- Templates contêm padrões; exportações de valores salvos releem o arquivo do host.
- Exportar o editor de aplicativo ou permissões inclui o rascunho, após confirmação.
- Importações validam o arquivo inteiro, mostram diferenças e só alteram o rascunho.
- É necessário salvar explicitamente. Importar não executa comandos nem reinicia.
- UUIDs, conta, certificados e pareamentos não são transferidos por esses formatos.
- Chaves desconhecidas existentes são preservadas pelo salvamento normal, mas não
  viram campos arbitrários de importação/exportação.

Exportações não são criptografadas e podem conter caminhos, endereços ou comandos
privados. Não equivalem a backup de toda a instalação.

## Aplicativos, capas e diagnóstico

Capas enviadas são cópias no host e são gravadas em modo binário. Cópias corrompidas
por versões anteriores precisam ser reenviadas; o original não é reparado nem alterado.
Caminhos de imagem devem ser informados sem aspas externas.

A biblioteca consulta o estado a cada três segundos enquanto visível. A leitura
pausa durante edição e após erro. Estados antigos não são afirmados como atuais
depois de uma falha; nenhuma ação de iniciar/encerrar é enviada automaticamente.

Abrir no Artemis oferece link e QR para o dispositivo que abre o link, com o host
previamente pareado. Não é um comando remoto do PC para abrir o cliente no celular.

“Atualizar informações do host” relê versão, driver e captura configurada, com
carregamento, horário e erro explícitos. Não mede a transmissão nem valida todos
os ajustes. Codec, FPS, rede e decodificação devem ser conferidos no Artemis.

## Autenticação e reinício

A sessão administrativa dura 15 dias. O backend mantém uma sessão por processo;
reiniciar o host, trocar credenciais ou fazer outro login invalida a sessão anterior.
Um HTTP 401 sozinho não comprova expiração por tempo.

O cookie `apollo_auth_<porta>` evita colisão com o cookie de outras instalações
em portas diferentes. Usa Secure, HttpOnly e SameSite=Strict. Ao atualizar uma
instalação antiga, entre novamente. Logs distinguem sessão ausente, expirada,
cookie ausente e sessão incompatível sem imprimir o token.

O reinício exige confirmação e fica bloqueado por rascunhos/operações pendentes.
Renovar o login não repete comandos rejeitados. Perda de conexão não confirma
sucesso nem falha: aguarde e verifique o host antes de tentar novamente.

## Pacotes e atualização

Use os arquivos e checksums da
[release deste fork](https://github.com/matheuspergoli/Apollo/releases/tag/v1.0.0).
Faça backup privado e encerre o host anterior antes de atualizar.

- **ZIP Windows x64:** extração manual; não instala serviços ou drivers sozinho.
- **Instalador Windows x64:** integração convencional com serviço, firewall e drivers.
  Sua execução é uma decisão explícita do usuário e pode alterar a instalação existente.
- **Código-fonte:** disponibilizado pelo GitHub a partir da tag da release.

O instalador é extraído e comparado ao ZIP no CI, sem executar sua instalação.
Não há declaração de assinatura Authenticode ou de instalação testada em todas
as versões do Windows. Não desative proteções para ignorar um alerta de segurança.

## Evidências e limites

O usuário confirmou uso real com Desktop, Steam e RetroBat, conexão/desconexão,
jogos, autenticação e importação/exportação global, por seção, de aplicativos e
permissões. Esse aceite é diferente dos testes automatizados com API simulada.

As verificações da release incluem Biome, TypeScript, unitários, Chromium, build,
integração dev, regressões de relógio, contratos C++/React, ensaio HTTPS Windows,
comparação binária do PNG, reinício autenticado e auditoria dos pacotes.

Os testes de interface cobrem temas claro/escuro, teclado, responsividade, rascunhos,
falhas e confirmação de ações. O reinício nativo exige saída normal do processo
original; sua recuperação no ambiente do usuário continua sujeita ao modo de execução.

Linux teve geração de manifests verificada; não foi executada uma nova matriz
completa de streaming Linux. Não foi feito benchmark controlado nem demonstrado
ganho de desempenho. O painel não mede latência de ponta a ponta.

Os ajustes de metadados e empacotamento desta release não alteram os comandos
locais dos aplicativos, a identidade do host ou o protocolo de pareamento.
