"""Assemble one host, preserved full UI and an explicitly opt-in React preview."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]
NATIVE_COMMIT = '2ab32807f04d7cfdb45d2a25c51644f222724456'
README = '''APOLLO - PACOTE UNICO DE TESTE

Este pacote tem UM sunshine.exe, as correcoes de clocks/captura ja compiladas,
o painel completo de compatibilidade e a previa React/Tailwind/shadcn.
NAO e migracao completa: configuracoes, aplicativos, pareamento e diagnostico
ainda usam o painel legado. Ele foi preservado, nao substituido por telas vazias.
Nao ha driver novo, PyroWave ou ganho de desempenho comprovado neste pacote.

USAR A PASTA JA EXTRAIDA NO SEU PC
1. Termine o stream. Pare o Apollo original em services.msc se estiver ativo.
2. Abra INICIAR.cmd, leia o aviso e digite TESTAR. Nao execute sunshine.exe
   diretamente. Nao rode dois hosts ao mesmo tempo.
3. Abra ABRIR-INTERFACE.cmd para a previa React, ou acesse:
   https://localhost:49990/assets/apollo-preview/index.html#/
4. Se pedir login, use as credenciais do pacote anterior. O painel completo
   continua em https://localhost:49990. Seus dados antigos foram preservados.
5. No Artemis, use a entrada do teste na porta 49989. Se o host nao for
   reconhecido, abra o painel completo e confira o pareamento; nao apague a
   entrada original nem suas credenciais para tentar resolver.

PRIMEIRO ENSAIO
- Na previa, confira login, tema claro/escuro/sistema, leitura do host e reload.
- Abra Configuracoes/Dispositivos pelos links de compatibilidade. Confira que
  suas opcoes continuam acessiveis. Nao sao telas React novas ainda.
- Teste Desktop e reconexao; depois a mesma cena em 1080p120, AV1, mesmo HDR,
  bitrate e cap de FPS. Registre stutter, frames perdidos e estatisticas Artemis.
- Termine o stream, use Ctrl+C no console e aguarde o host encerrar.
- Restaure Apollo Service em services.msc. Confira o retorno da TV/NanoKVM e
  da entrada original do Artemis. Mantenha acesso local ao PC durante o teste.

SEGURANCA E DADOS
O launcher nao instala driver/servico, nao cria firewall e nao para servicos.
O host normal pode ajustar preferencias NVIDIA e topologia: nao e sandbox.
Nao desative Defender/SmartScreen/firewall para contornar erros deste teste.
O ZIP NAO inclui seus certificados, senhas ou pareamentos. A pasta ja extraida
no seu PC recebe uma copia LOCAL dos dados do teste anterior, fora do ZIP.
Nao extraia novamente por cima de uma pasta usada nem sobrescreva config.
Se extrair o ZIP em pasta nova, ele inicia com dados novos, sem sua conta.

VALIDACAO
Frontend: Biome, TypeScript, testes unitarios e de navegador com API simulada,
incluindo a hospedagem aninhada e navegacao de compatibilidade.
Host: binario do CI 39317972369, inalterado, sem nova compilacao necessaria
porque nao houve mudanca C++ neste lote. Teste --version no Windows nao prova
stream/HDR/recuperacao. O teste real do pacote ainda depende de voce.

Fontes: https://github.com/matheuspergoli/Apollo
Consulte BUILD.json, SHA256SUMS.txt, LICENSE, NOTICE e THIRD-PARTY-UI.
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    native, output = map(Path, sys.argv[1:3])
    subprocess.run(['git', 'diff', '--quiet', NATIVE_COMMIT, 'HEAD', '--', 'src', 'cmake', 'CMakeLists.txt', 'src_assets'], cwd=ROOT, check=True)
    if subprocess.run(['git', 'status', '--porcelain', '--', 'dashboard'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip():
        raise ValueError('Commit frontend changes before packaging')
    artifact = native.parents[1]
    if (artifact / 'SOURCE_COMMIT.txt').read_text().strip() != NATIVE_COMMIT:
        raise ValueError('Unexpected native build source')
    native_hash = digest(native.read_bytes())
    if native_hash != (artifact / 'SHA256SUMS.txt').read_text().split()[0]:
        raise ValueError('Native CI archive checksum mismatch')
    dist = ROOT / 'dashboard/dist'
    if not (dist / 'ui-build.json').is_file():
        raise ValueError('Missing verified UI build metadata. This legacy preview packager must not package the ongoing full migration.')
    ui = json.loads((dist / 'ui-build.json').read_text())
    if ui.get('mode') != 'compatibility-preview':
        raise ValueError('The legacy preview packager is retired for this frontend. Finish full-migration release gates before creating a replacement test package.')
    if not (dist / 'index.html').is_file():
        raise ValueError('Build and test the React frontend first')
    if output.exists():
        raise ValueError('Output already exists; refusing to overwrite it')
    output.mkdir(parents=True)
    stage = output / 'Apollo-Teste'
    stage.mkdir()
    with ZipFile(native) as archive:
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            if entry.is_dir():
                continue
            if '..' in path.parts or len(path.parts) < 2 or path.parts[0] != 'Apollo':
                raise ValueError('Unexpected archive path')
            relative = PurePosixPath(*path.parts[1:])
            if relative.as_posix() not in ('sunshine.exe', 'zlib1.dll') and relative.parts[0] != 'assets':
                continue
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(entry))
    for source in dist.rglob('*'):
        if not source.is_file():
            continue
        if source.is_symlink():
            raise ValueError('Unexpected UI symlink')
        target = stage / 'assets/web/assets/apollo-preview' / source.relative_to(dist)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    config = stage / 'config'
    config.mkdir()
    (config / 'sunshine.conf').write_text(
        'sunshine_name = Apollo (teste)\nport = 49989\nupnp = disabled\n'
        'origin_web_ui_allowed = pc\nfallback_mode = 1920x1080x120\n'
        'headless_mode = enabled\ngamepad = x360\nnvenc_preset = 1\n')
    (stage / 'INICIAR.ps1').write_bytes((ROOT / 'tools/release/start-test.ps1').read_bytes())
    (stage / 'INICIAR.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR.ps1"\r\n')
    (stage / 'ABRIR-INTERFACE.cmd').write_bytes(b'@echo off\r\nstart "" "https://localhost:49990/assets/apollo-preview/index.html#/"\r\n')
    (stage / 'ABRIR-PAINEL-COMPLETO.cmd').write_bytes(b'@echo off\r\nstart "" "https://localhost:49990/"\r\n')
    (stage / 'LEIA-ME.txt').write_text(README, encoding='utf-8')
    for name in ('LICENSE', 'NOTICE'):
        (stage / name).write_bytes((ROOT / name).read_bytes())
    notices = stage / 'THIRD-PARTY-UI'
    notices.mkdir()
    for name in ('SHADCN_LICENSE.txt', 'THIRD_PARTY_NOTICES.md'):
        (notices / name).write_bytes((ROOT / 'dashboard' / name).read_bytes())
    dependencies = subprocess.run(['npm', 'ls', '--omit=dev', '--all', '--parseable'], cwd=ROOT / 'dashboard', capture_output=True, text=True, check=True).stdout
    collected = []
    modules = (ROOT / 'dashboard/node_modules').resolve()
    for value in sorted(set(dependencies.splitlines())):
        directory = Path(value).resolve()
        if not directory.is_relative_to(modules) or not (directory / 'package.json').is_file():
            continue
        package = json.loads((directory / 'package.json').read_text())
        name = package['name'].replace('/', '__')
        copied = []
        for license_file in directory.iterdir():
            if license_file.is_file() and license_file.name.lower().startswith(('license', 'licence', 'notice', 'copying')):
                filename = f'{name}-{package["version"]}-{license_file.name}'
                (notices / filename).write_bytes(license_file.read_bytes())
                copied.append(filename)
        collected.append({'name': package['name'], 'version': package['version'], 'license': package.get('license'), 'texts': copied})
    (notices / 'dependencies.json').write_text(json.dumps(collected, indent=2) + '\n')
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
    (stage / 'BUILD.json').write_text(json.dumps({
        'native_source': NATIVE_COMMIT, 'native_ci_run': 39317972369,
        'native_archive_sha256': native_hash, 'frontend_source': commit,
        'frontend_path': '/assets/apollo-preview/index.html#/',
        'full_ui': 'preserved-compatibility', 'migration_complete': False,
        'device_stream_validated': False, 'private_data_in_archive': False,
    }, indent=2) + '\n')
    files = sorted(path for path in stage.rglob('*') if path.is_file())
    (stage / 'SHA256SUMS.txt').write_text(''.join(f'{digest(path.read_bytes())}  {path.relative_to(stage).as_posix()}\n' for path in files))
    destination = output / 'Apollo-Teste.zip'
    with ZipFile(destination, 'x', ZIP_DEFLATED) as archive:
        for path in sorted(stage.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(output))
    print(json.dumps({'zip': str(destination), 'sha256': digest(destination.read_bytes()), 'folder': str(stage)}, indent=2))


if __name__ == '__main__':
    main()
