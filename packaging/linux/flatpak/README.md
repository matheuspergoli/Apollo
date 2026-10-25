# Receita Flatpak

Esta é uma receita auxiliar de build, não um pacote publicado ou validado no
Flathub por este fork. O identificador herdado não indica afiliação com o projeto
original. O suporte nativo Linux e a distribuição de um Flatpak são escopos diferentes.

O manifesto usa SDK com Node.js 24 e instalação offline por pnpm. Antes de gerar
o manifesto, o responsável pelo pacote precisa fornecer `generated-sources.json`
com o binário da versão de pnpm declarada e o store correspondente ao lockfile:

- `flatpak-node/pnpm/`: binário pnpm para a arquitetura de destino;
- `flatpak-node/pnpm-store/`: store previamente preenchido para o build offline.

O código-fonte deve corresponder ao commit do manifesto. O CMake copia o lockfile
e os metadados do workspace para o diretório de geração. Não reutilize bundles de
outro gerenciador nem habilite rede para mascarar um store incompleto.

Alterações nessa receita exigem um build Flatpak completo antes de anunciar suporte.
Os testes HTTP usam apenas fixtures locais dentro do sandbox; não dependem de um
servidor de desenvolvimento da interface.
