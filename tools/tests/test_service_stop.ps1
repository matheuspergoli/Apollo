$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('apollo-stop-fixture-' + [guid]::NewGuid().ToString('N'))
. (Join-Path $PSScriptRoot '../../src_assets/windows/misc/migration/update-installation.ps1') -InstallDir $testRoot -Mode Prepare

# These stand-ins cover the updater's own control flow. They never operate SCM.
function Stop-Service { throw 'Blocking or real service operations are forbidden in this test.' }
function Start-Service { throw 'Real service operations are forbidden in this test.' }
function Get-Service { throw 'Real service controllers are forbidden in this test.' }
function Stop-Process { throw 'Process termination is forbidden in this test.' }
function Get-CimInstance {
    param($ClassName, $Filter, $OperationTimeoutSec)
    if ($OperationTimeoutSec -lt 1) { throw 'Every CIM operation needs a finite timeout.' }
    if ($ClassName -eq 'Win32_Service') {
        $script:queries++
        if (-not $script:serviceExists) { return $null }
        return [pscustomobject]@{ State = $script:state; PathName = $script:owner }
    }
    if ($ClassName -eq 'Win32_Process' -and $script:hostRemains) {
        return [pscustomobject]@{ ExecutablePath = $hostBinary }
    }
}
function Invoke-CimMethod {
    param($InputObject, $MethodName, $OperationTimeoutSec)
    if ($MethodName -ne 'StopService' -or $OperationTimeoutSec -lt 1) { throw 'Unexpected service operation.' }
    $script:requests++
    if ($script:requestDelay) { Start-Sleep -Milliseconds $script:requestDelay }
    if (-not $script:neverStops) { $script:state = 'Stopped' }
    return [pscustomobject]@{ ReturnValue = $script:returnCode }
}
function Reset-Fixture {
    $script:state = 'Running'
    $script:owner = '"' + $serviceBinary + '"'
    $script:requests = 0
    $script:queries = 0
    $script:serviceExists = $true
    $script:requestDelay = 0
    $script:neverStops = $false
    $script:hostRemains = $false
    $script:returnCode = 0
}
function Assert-Fails([scriptblock]$Action) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    if (-not $failed) { throw 'Expected the stop operation to fail.' }
}

Reset-Fixture
Stop-OwnedApolloService | Out-Null
if ($script:requests -ne 1) { throw 'Stop must be requested exactly once.' }
Reset-Fixture
$script:state = 'Stopped'
Stop-OwnedApolloService | Out-Null
if ($script:requests -ne 0) { throw 'Already stopped services must not receive stop requests.' }
Reset-Fixture
$script:serviceExists = $false
Stop-OwnedApolloService | Out-Null
if ($script:requests -ne 0) { throw 'An absent service must not receive stop requests.' }
Reset-Fixture
$script:requestDelay = 150
Assert-Fails { Stop-OwnedApolloService -Timeout ([TimeSpan]::FromMilliseconds(50)) | Out-Null }
if ($script:queries -ne 1) { throw 'The request time must consume the same stop deadline.' }

foreach ($scenario in @('service', 'host')) {
    Reset-Fixture
    if ($scenario -eq 'service') { $script:neverStops = $true } else {
        $script:state = 'Stopped'; $script:hostRemains = $true
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Assert-Fails { Stop-OwnedApolloService -Timeout ([TimeSpan]::FromMilliseconds(150)) | Out-Null }
    if ($watch.Elapsed.TotalSeconds -gt 3) { throw 'Stop exceeded its bounded test budget.' }
}
Reset-Fixture
$script:returnCode = 5
Assert-Fails { Stop-OwnedApolloService | Out-Null }
Reset-Fixture
$script:owner = '"C:\Other installation\tools\sunshinesvc.exe"'
Assert-Fails { Stop-OwnedApolloService | Out-Null }
if ($script:requests -ne 0) { throw 'A foreign service must never be stopped.' }
Write-Output 'Service stop regressions passed without changing services or processes.'
