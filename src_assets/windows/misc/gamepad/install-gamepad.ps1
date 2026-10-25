$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-VigemReady {
    $driver = Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'"
    if ($driver -and $driver.StartMode -eq 'Disabled') { throw 'ViGEmBus is disabled; refusing to override this preference.' }
    $path = Join-Path $env:SystemRoot 'System32\drivers\ViGEmBus.sys'
    $native = Join-Path $env:SystemRoot 'Sysnative\drivers\ViGEmBus.sys'
    if (Test-Path -LiteralPath $native) { $path = $native }
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    $version = [version](Get-Item -LiteralPath $path).VersionInfo.FileVersion
    return $driver -and $driver.State -eq 'Running' -and $version -ge [version]'1.17.0.0'
}

try {
    if (Test-VigemReady) { Write-Output 'Compatible ViGEmBus driver is running; left unchanged.'; exit 0 }
    $installer = Join-Path $PSScriptRoot 'vigembus_installer.exe'
    $contractPath = Join-Path $PSScriptRoot '..\drivers\sudovda\runtime-contract.json'
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    $expected = $contract.sha256.PSObject.Properties['scripts/vigembus_installer.exe'].Value
    if ($expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $installer).Hash -ine $expected) {
        throw 'ViGEmBus installer does not match the approved package.'
    }
    $process = Start-Process -FilePath $installer -ArgumentList '/passive', '/norestart' -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "ViGEmBus installer failed: $($process.ExitCode)" }
    if ($process.ExitCode -eq 3010) { Write-Warning 'Windows restart is required for ViGEmBus.'; exit 3010 }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-VigemReady) { Write-Output 'ViGEmBus driver is running.'; exit 0 }
        Start-Sleep -Seconds 1
    }
    throw 'ViGEmBus did not become ready; installation is not confirmed.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
