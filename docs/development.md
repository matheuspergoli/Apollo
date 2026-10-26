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

Ao corrigir um defeito, acrescente uma regressão no nível em que ele ocorreu.
Teste o efeito observado e a ausência de gravações inesperadas, não apenas textos
ou um status HTTP. Exemplos e fixtures devem ser genéricos e não conter dados pessoais.

Testes com API simulada não verificam streaming, HDR ou drivers. A auditoria extrai
o instalador sem instalar serviços. Separadamente, o workflow Windows exige testes
do instalador real em runner descartável. Como o instalador oficial do ViGEmBus
recusa Windows Server, a preparação exclusiva do CI extrai o pacote com hash
verificado e instala seu driver sem modificar o MSI ou remover dispositivos
existentes. Um controle virtual deve ser criado, enviar um estado observado pelo
XInput e ser removido antes de prosseguir. Reboot pendente ou falha bloqueiam o job.
Isso qualifica o caminho com ViGEmBus já instalado, não a instalação limpa do
fornecedor em Windows 10/11. Essa validação, a matriz de hardware e o streaming
Linux permanecem separados; não os declare aprovados por uma contagem de testes.
Não altere um host ativo para testar.

## Dependências e distribuição

`LICENSE` é a licença do Apollo. `NOTICE` contém atribuições que acompanham o código.
O build gera um único `NOTICE.txt` para as dependências do frontend, preservando os
textos instalados e omitindo caminhos locais. Não são necessários documentos de
proveniência por componente nem cópias manuais de cada licença no pacote fonte.

Atualizações de dependência devem ser intencionais, com lockfile e testes no mesmo
commit. Não mova tags publicadas nem substitua binários de uma release durante
manutenção do repositório.
