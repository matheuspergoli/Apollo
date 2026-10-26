#requires -Version 7.0
param([Parameter(Mandatory = $true)][string]$Candidate,
      [Parameter(Mandatory = $true)][string]$Probe)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or $env:GITHUB_REPOSITORY -cne 'matheuspergoli/Apollo') {
    throw 'Driver preparation is restricted to the disposable fork runner.'
}
if ((Get-CimInstance Win32_OperatingSystem).ProductType -eq 1) {
    throw 'This preparation is only for the Server CI environment, not client Windows.'
}
if (Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'") { throw 'An existing bus prevents isolated preparation.' }
if (Get-CimInstance Win32_PnPEntity | Where-Object {
    @($_.HardwareID) -contains 'Nefarius\ViGEmBus\Gen1' -or @($_.HardwareID) -contains 'Root\ViGEmBus'
}) { throw 'An existing bus device prevents isolated preparation.' }
$contract = Get-Content -LiteralPath (Join-Path $Candidate 'drivers/sudovda/runtime-contract.json') -Raw | ConvertFrom-Json
$installer = Join-Path $Candidate 'scripts/vigembus_installer.exe'
$expected = $contract.sha256.PSObject.Properties['scripts/vigembus_installer.exe'].Value
if ($expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $installer).Hash -ine $expected) {
    throw 'Runner preparation requires the exact approved vendor package.'
}
$destination = Join-Path $env:RUNNER_TEMP ('apollo-vigem-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $destination | Out-Null
# This vendor bootstrapper extracts beside its executable, ignoring the requested
# destination. Keep the verified executable and all outputs in the isolated root.
$isolatedInstaller = Join-Path $destination 'ViGEmBus_1.21.442_x64_x86_arm64.exe'
Copy-Item -LiteralPath $installer -Destination $isolatedInstaller
if ((Get-FileHash -LiteralPath $isolatedInstaller).Hash -ine $expected) { throw 'Copied vendor package hash mismatch.' }
function Invoke-Bounded([string]$Executable, [string]$Arguments, [string]$WorkingDirectory = $destination) {
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru
    if (-not $process.WaitForExit(90000)) { $process.Kill(); throw 'Runner driver preparation timed out.' }
    if ($process.ExitCode -ne 0) { throw "Runner driver operation failed or requires reboot: $($process.ExitCode)" }
}
# Extract the checksum-pinned vendor archive; never patch its MSI conditions.
$extractionLog = Join-Path $destination 'extraction.log'
Invoke-Bounded $isolatedInstaller ('/extract "' + (Join-Path $destination 'payload') + '" /exelog "' + $extractionLog + '"')
# The vendor bootstrapper may return before its extraction child has finished.
# Bound the wait and require actual output, not just its successful exit code.
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (@(Get-ChildItem -LiteralPath $destination -Filter 'ViGEmBus.inf' -Recurse -File).Count) { break }
    Start-Sleep -Seconds 1
}
$packages = @(Get-ChildItem -LiteralPath $destination -Filter 'ViGEmBus.inf' -Recurse -File | Where-Object {
    $tool = Join-Path $_.DirectoryName 'nefconw.exe'
    if (-not (Test-Path -LiteralPath $tool)) { return $false }
    $bytes = [IO.File]::ReadAllBytes($tool)
    $pe = [BitConverter]::ToInt32($bytes, 60)
    [BitConverter]::ToUInt16($bytes, $pe + 4) -eq 0x8664
})
if ($packages.Count -ne 1) {
    if (Test-Path -LiteralPath $extractionLog) { Get-Content -LiteralPath $extractionLog | Out-Host }
    Get-ChildItem -LiteralPath $destination -Recurse -File | Select-Object FullName, Length | Format-Table | Out-Host
    throw 'Expected exactly one extracted vendor x64 driver/tool pair; no driver operation was attempted.'
}
$inf = $packages[0]
$tool = Join-Path $inf.DirectoryName 'nefconw.exe'
Invoke-Bounded $tool '--create-device-node --hardware-id Nefarius\ViGEmBus\Gen1 --class-name System --class-guid 4D36E97D-E325-11CE-BFC1-08002BE10318'
Invoke-Bounded $tool ('--install-driver --inf-path "' + $inf.FullName + '"')
Invoke-Bounded ([IO.Path]::GetFullPath($Probe)) '--ci-vigem-probe'
Write-Output 'CI-only ViGEmBus preparation and real virtual controller lifecycle passed. Client Windows vendor-installer coverage is still required.'
