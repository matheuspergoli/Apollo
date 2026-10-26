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
Dependências de sistema podem exigir permissões; o CI as instala no runner isolado.

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

`LICENSE` é a licença do Apollo. `NOTICE` contém atribuições que acompanham o código.
O build gera um único `NOTICE.txt` para as dependências do frontend, preservando os
textos instalados e omitindo caminhos locais. Não são necessários documentos de
proveniência por componente nem cópias manuais de cada licença no pacote fonte.

Atualizações de dependência devem ser intencionais, com lockfile e testes no mesmo
commit. Não mova tags publicadas nem substitua binários de uma release durante
manutenção do repositório.
