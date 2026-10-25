# Contêineres de desenvolvimento

As receitas em `docker/` são auxiliares de build e desenvolvimento Linux. Não há
imagem de produção publicada ou validada por este fork. Imagens de outros projetos
não equivalem à distribuição do Apollo.

O ambiente de ferramenta usa Node.js 24 e Corepack para executar a versão de pnpm
declarada pelo projeto. Consulte [development.md](docs/development.md) para os
comandos e [building.md](docs/building.md) para as dependências nativas.

Um contêiner com acesso à GPU, dispositivos, rede ou diretório pessoal não é uma
barreira de isolamento completa. Não monte dados privados nem use uma instalação
ativa do host para validar uma receita de build.
