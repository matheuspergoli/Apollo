# Compilação

Windows x64 é o alvo principal de distribuição. Linux mantém os backends existentes,
mas este fork não anuncia pacotes Linux ou compatibilidade universal de hardware.
As regras de desenvolvimento e cobertura estão em [development.md](development.md).

## Windows

Use o terminal **MSYS2 UCRT64**, GCC com suporte a C++23, CMake, Ninja, Python,
Node.js 24 oficial e a versão de pnpm fixada em `package.json`. Instale o Node fora
do MSYS2 e disponibilize `node` e `pnpm` no `PATH`. A lista usada pelo CI está em
[apollo-windows.yml](../.github/workflows/apollo-windows.yml).

```sh
pacman -S --needed git mingw-w64-ucrt-x86_64-toolchain \
  mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja \
  mingw-w64-ucrt-x86_64-pkgconf mingw-w64-ucrt-x86_64-boost \
  mingw-w64-ucrt-x86_64-cppwinrt mingw-w64-ucrt-x86_64-curl-winssl \
  mingw-w64-ucrt-x86_64-MinHook mingw-w64-ucrt-x86_64-miniupnpc \
  mingw-w64-ucrt-x86_64-nsis mingw-w64-ucrt-x86_64-onevpl \
  mingw-w64-ucrt-x86_64-openssl mingw-w64-ucrt-x86_64-opus \
  mingw-w64-ucrt-x86_64-nlohmann_json
```

```sh
git clone --recurse-submodules https://github.com/matheuspergoli/Apollo.git
cd Apollo
pnpm install --frozen-lockfile --ignore-scripts
export BUILD_VERSION="$(node -p "require('./package.json').version")"
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_DOCS=OFF -DBUILD_TESTS=OFF -DBUILD_UI_CONTRACT_TESTS=ON
cmake --build build --parallel 4
```

As opções estão em [options.cmake](../cmake/prep/options.cmake). O build gera o
painel com pnpm e obtém dependências de distribuição com hashes fixados. Compilar
ou extrair os pacotes não instala drivers nem serviços no computador.

## Pacotes Windows

O manifesto deve ser gerado **depois** da preparação dos binários e **antes** do
CPack. Não publique um instalador gerado sem essa etapa.

```sh
strip --strip-unneeded build/sunshine.exe
stage="$(mktemp -d "$PWD/build/install-manifest.XXXXXX")"
cmake --install build --prefix "$stage"
python tools/release/create-install-manifest.py "$stage" "$PWD/build/installation-manifest.json"
cd build
cpack -G ZIP --config CPackConfig.cmake
cpack -G NSIS --config CPackConfig.cmake
cd ..
python tools/release/audit-dashboard-package.py build/cpack_artifacts/Apollo.zip
```

O CI também compara o conteúdo do instalador ao ZIP, verifica integridade e impede
a inclusão de dados privados. Um pacote compilado não é, por si só, uma release
qualificada. As releases publicadas identificam o commit de origem e os hashes dos
binários; não substitua seus arquivos silenciosamente.

## Linux e documentação

As dependências Linux variam por distribuição; consulte o helper local
[linux_build.sh](../scripts/linux_build.sh) e as opções CMake antes de executar
operações no sistema. NVFBC, CUDA, VA-API, Wayland e X11 dependem do backend e do
hardware. Não use a qualificação Windows como evidência de streaming Linux.

A documentação Doxygen usa [Doxyfile](Doxyfile) e o submódulo `third-party/doxyconfig`.
O código-fonte e os arquivos Markdown locais são a referência deste fork, não os
sites ou pipelines de publicação de outros projetos.
