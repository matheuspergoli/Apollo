"""Create driver/service-free local test packages from verified CI artifacts."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]
README = """GOLDEN APOLLO - PRIMEIRO TESTE EXPERIMENTAL

NAO e instalador. Nao substitua C:\\Program Files\\Apollo.
Nao ha PyroWave nem driver virtual novo neste pacote.

1. Extraia o ZIP em uma pasta nova, fora da instalacao original e fora de
   pastas protegidas. Nao execute dentro do ZIP.
2. Termine seu stream original. Abra services.msc e pare manualmente
   Apollo Service (ApolloService). Nao desinstale nem altere o tipo de inicio.
3. Clique em INICIAR-TESTE.cmd. Ele recusa iniciar com o servico original
   ativo, outro sunshine.exe ou portas do laboratorio ocupadas. Nao para
   servicos, instala drivers ou cria regras de firewall automaticamente.
4. Leia os avisos e digite TESTAR. O executavel nao tem assinatura de
   distribuicao validada: nao desative Defender ou SmartScreen para testa-lo.
5. Abra https://localhost:49990 no PC. O certificado local e novo; confirme
   endereco e origem do pacote antes de aceitar a excecao de certificado.
   Crie credenciais novas. Nao copie chaves/pareamentos do original.
6. No Artemis existente, adicione NOVO host IP-DO-PC:49989 e pareie pelo
   painel do laboratorio. Preserve a entrada original. Comece na LAN.
   Se o cliente nao aceitar porta personalizada, pare e relate; nao mude
   as portas do Apollo original. Firewall pode bloquear a conexao: nenhuma
   liberacao automatica foi feita e nao se deve desligar o firewall.
7. Primeiro valide Desktop/painel/reconexao. Depois compare a mesma cena
   em 1080p120, AV1, mesmo HDR, bitrate e limite de FPS. Use as estatisticas
   do Artemis; registre perdas, stutter e qualidade, nao apenas media.
8. Encerre o stream, feche o host com Ctrl+C e aguarde terminar. Reative
   Apollo Service em services.msc; use a entrada original do Artemis.
   Confira TV/NanoKVM e retorno do display. Nunca rode dois streams juntos.

O host possui rotinas normais que podem ajustar preferencias NVIDIA e
topologia do display. Pastas/portas separadas nao isolam esses recursos
globais. Este teste alterna os hosts e exige retorno manual ao original.
Nao teste durante trabalho importante ou sem acesso local ao PC.

Validado antes da entrega: compilacao Windows, testes unitarios do candidato,
conteudo do ZIP e teste --version (quando registrado no relatorio).
NAO validado: stream real no S25+, ganhos de performance, HDR ou recuperacao.
Teste de dispositivo e experimental; nao ha promessa de ganho ou ausencia de bugs.

CONTROLE usa upstream adc5c5a0 + correcao de compilacao AMF fcba3f6.
CANDIDATO adiciona correcoes de clocks e painel Golden somente leitura.
Use um pacote por vez. Os dois usam o mesmo bloco de portas e dados separados.
Fonte: https://github.com/matheuspergoli/Apollo
CI: https://github.com/matheuspergoli/Apollo/actions/runs/39317972369
Metadados e hashes estao em BUILD.json e SHA256SUMS.txt.
"""


def main():
    source, output = map(Path, sys.argv[1:3])
    output.mkdir(parents=True, exist_ok=True)
    for variant in ('baseline', 'candidate'):
        artifact = source / f'golden-{variant}-windows-unvalidated'
        incoming = artifact / 'cpack_artifacts/Apollo.zip'
        expected = (artifact / 'SHA256SUMS.txt').read_text().split()[0]
        if hashlib.sha256(incoming.read_bytes()).hexdigest() != expected:
            raise ValueError('CI archive checksum mismatch')
        stage = output / f'Golden-Apollo-{variant}-39317972369'
        stage.mkdir(exist_ok=False)
        with ZipFile(incoming) as archive:
            for entry in archive.infolist():
                parts = PurePosixPath(entry.filename).parts
                if entry.is_dir():
                    continue
                if not parts or parts[0] != 'Apollo' or '..' in parts:
                    raise ValueError('Unexpected archive path')
                relative = PurePosixPath(*parts[1:])
                if relative.as_posix() not in ('sunshine.exe', 'zlib1.dll') and relative.parts[0] != 'assets':
                    continue
                target = stage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(entry))
        if not (stage / 'sunshine.exe').is_file():
            raise ValueError('Missing host executable')
        config = stage / 'config'
        config.mkdir()
        (config / 'sunshine.conf').write_text(
            f'sunshine_name = Golden Apollo {variant}\nport = 49989\nupnp = disabled\n'
            'origin_web_ui_allowed = pc\nfallback_mode = 1920x1080x120\n'
            'headless_mode = enabled\ngamepad = x360\nnvenc_preset = 1\n', encoding='utf-8')
        (stage / 'INICIAR-TESTE.ps1').write_bytes((ROOT / 'tools/golden/start-lab.ps1').read_bytes())
        (stage / 'INICIAR-TESTE.cmd').write_bytes(
            b'@echo off\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR-TESTE.ps1"\r\n')
        (stage / 'LEIA-ME.txt').write_text(README, encoding='utf-8')
        for name in ('LICENSE', 'NOTICE'):
            (stage / name).write_bytes((ROOT / name).read_bytes())
        metadata = {'variant': variant, 'ci_run': 39317972369,
                    'source_commit': (artifact / 'SOURCE_COMMIT.txt').read_text().strip(),
                    'upstream_zip_sha256': expected, 'base_port': 49989,
                    'control_build_fix': 'fcba3f6b74bca3bcbc5c51546073df7b917d2997',
                    'device_stream_validated': False, 'signed_distribution': False}
        (stage / 'BUILD.json').write_text(json.dumps(metadata, indent=2) + '\n')
        files = sorted(p for p in stage.rglob('*') if p.is_file())
        (stage / 'SHA256SUMS.txt').write_text(''.join(
            f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(stage).as_posix()}\n'
            for p in files))
        destination = output / f'{stage.name}.zip'
        with ZipFile(destination, 'x', ZIP_DEFLATED) as archive:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(output))
        print(destination, hashlib.sha256(destination.read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
