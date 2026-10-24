# Desenvolvimento do Apollo

## Interface

A única implementação web fica em `dashboard/`: React, TypeScript estrito,
TanStack Router por arquivos, Query, Tailwind e fontes oficiais do shadcn/Base UI.
Não há Vue, Bootstrap, EJS, catálogos de tradução ou provedores de i18n.
A interface é fixa em português brasileiro. Comandos, caminhos e dados técnicos
não são traduzidos nem alterados para exibição.

```sh
cd dashboard
npm ci --ignore-scripts
npm run check
npm run typecheck
npm test
npm run check:dev
npm run test:browser
```

As regras do pacote, a arquitetura e os gates estão em `dashboard/AGENTS.md`,
`dashboard/README.md` e `docs/release-1.0.md`. Use componentes do registro
shadcn configurado antes de criar qualquer controle próprio. Não adicione uma
infraestrutura de idiomas ou camada de compatibilidade com o frontend removido.

O target CMake `web-ui` instala as dependências pelo lockfile de `dashboard/` e
executa `build:host`, que gera os HTMLs usados pelo servidor C++. Não construa
assets diretamente na instalação do usuário durante o desenvolvimento.

## Código nativo

Preserve a formatação de `.clang-format` e os contratos do host. O suporte a
Unicode/UTF-8 é necessário para nomes, caminhos e entrada; não é infraestrutura
de tradução e não deve ser removido.

Os testes C++ usam Google Test, no submódulo correspondente. Compile com
`BUILD_TESTS=ON` e execute `build/tests/test_sunshine` (ou `.exe` no Windows).
Os testes de configuração usam o schema React e o parser nativo, sem fontes Vue
ou JSONs de outros idiomas.

Testes do navegador com API simulada não comprovam integração nativa, streaming,
HDR ou latência física. Registre origem, limitações e recuperação de cada ensaio.
Publique alterações somente em `matheuspergoli/Apollo`, nunca no repositório original.
