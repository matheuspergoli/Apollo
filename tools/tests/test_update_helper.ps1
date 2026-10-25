param([Parameter(Mandatory = $true)][string]$HostExecutable)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:GITHUB_REPOSITORY -cne 'matheuspergoli/Apollo') {
    throw 'Direct update-helper integration is restricted to the isolated fork runner.'
}
if (Get-Service ApolloService -ErrorAction SilentlyContinue) { throw 'A pre-existing service prevents this test.' }
$work = Join-Path $env:RUNNER_TEMP ('apollo-update-helper-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $work 'Application with spaces'
New-Item -ItemType Directory -Path (Join-Path $root 'config') -Force | Out-Null
$binary = Join-Path $root 'sunshine.exe'
Copy-Item -LiteralPath $HostExecutable -Destination $binary
$config = Join-Path $root 'config\sunshine.conf'
[IO.File]::WriteAllBytes($config, [byte[]](0..255))
$state = Join-Path $work 'state.json'
$manifest = Join-Path $work 'manifest.json'
$files = @{ 'sunshine.exe' = (Get-FileHash $binary).Hash }
@{ format = 'apollo-installed-files'; version = 1; appVersion = '1.0.1'; files = $files } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifest -Encoding utf8
$helper = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../src_assets/windows/misc/migration/update-installation.ps1'))
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir $root -Mode Prepare -StatePath $state -Version '1.0.1' -NoHostIntegration
if ($LASTEXITCODE -ne 0) { throw 'Direct helper preparation failed.' }
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir $root -Mode Verify -ManifestPath $manifest
if ($LASTEXITCODE -ne 0) { throw 'Direct installed-file verification failed.' }
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -InstallDir $root -Mode Finish -StatePath $state -ManifestPath $manifest
if ($LASTEXITCODE -ne 0) { throw 'Direct helper completion failed.' }
if ((Get-FileHash $config).Hash -ne (Get-FileHash (Join-Path ((Get-Content $state -Raw | ConvertFrom-Json).Snapshot.Backup) 'files\config\sunshine.conf')).Hash) {
    throw 'Direct helper did not preserve data.'
}
Write-Output 'Direct prepare/verify/finish integration passed without operating services or drivers.'
