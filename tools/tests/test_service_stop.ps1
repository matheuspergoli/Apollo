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

# Startup must recognize only this service's child and its expected listener.
# The real helper is exercised; SCM, processes and network remain stand-ins.
function Start-Service {
    param($Name, $ErrorAction)
    if ($Name -ne 'ApolloService') { throw 'Unexpected service start.' }
    $script:starts++
}
function Get-CimInstance {
    param($ClassName, $Filter, $OperationTimeoutSec, $Namespace)
    if ($OperationTimeoutSec -lt 1) { throw 'Startup queries require finite timeouts.' }
    if ($ClassName -eq 'Win32_Service') {
        $script:queries++
        if (($script:queries -gt 1 -or $script:delayInitialQuery) -and $script:queryDelay) { Start-Sleep -Milliseconds $script:queryDelay }
        $pidValue = if ($script:queries -eq 1) { 0 } else { 501 }
        return [pscustomobject]@{ State = 'Running'; StartMode = 'Auto'; PathName = $script:owner; ProcessId = $pidValue }
    }
    if ($ClassName -eq 'Win32_Process') {
        $script:hostQueries++
        $parent = if ($script:foreignParent) { 999 } else { 501 }
        $child = [pscustomobject]@{ ExecutablePath = $hostBinary; ProcessId = 602; ParentProcessId = $parent }
        $child
        if ($script:duplicateHost) { $child }
        return
    }
    if ($ClassName -eq 'MSFT_NetTCPConnection') {
        if ($Namespace -ne 'root/StandardCimv2' -or $Filter -ne 'State=2 AND LocalPort=47990') {
            throw 'Startup must query only the configured listening port.'
        }
        $script:listenerQueries++
        $ownerPid = if ($script:foreignListener) { 999 } else { 602 }
        return [pscustomobject]@{ OwningProcess = $ownerPid; LocalPort = 47990; LocalAddress = '127.0.0.1' }
    }
    throw "Unexpected startup query: $ClassName"
}
function Reset-StartupFixture {
    $script:owner = '"' + $serviceBinary + '"'
    $script:queries = 0; $script:starts = 0; $script:hostQueries = 0; $script:listenerQueries = 0
    $script:foreignParent = $false; $script:foreignListener = $false; $script:duplicateHost = $false
    $script:queryDelay = 0; $script:delayInitialQuery = $false
}
Reset-StartupFixture
Start-OwnedApolloService | Out-Null
if ($script:starts -ne 1 -or $script:hostQueries -ne 1 -or $script:listenerQueries -ne 1) {
    throw 'A ready owned host must be confirmed immediately using the refreshed supervisor PID.'
}
foreach ($scenario in @('foreignParent', 'foreignListener', 'duplicateHost')) {
    Reset-StartupFixture
    Set-Variable -Name $scenario -Scope Script -Value $true
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Assert-Fails { Start-OwnedApolloService -Timeout ([TimeSpan]::FromMilliseconds(150)) | Out-Null }
    if ($watch.Elapsed.TotalSeconds -gt 3) { throw 'Startup exceeded its bounded test budget.' }
    if ($script:startupObservation.ExpectedPort -ne 47990) { throw 'Failed startup must retain its endpoint observation.' }
}
Reset-StartupFixture
$script:queryDelay = 150
Assert-Fails { Start-OwnedApolloService -Timeout ([TimeSpan]::FromMilliseconds(50)) | Out-Null }
if ($script:hostQueries -ne 0 -or $script:listenerQueries -ne 0) {
    throw 'An exhausted startup budget must not start more inspections.'
}
Reset-StartupFixture
$script:delayInitialQuery = $true
$script:queryDelay = 150
Assert-Fails { Start-OwnedApolloService -Timeout ([TimeSpan]::FromMilliseconds(50)) | Out-Null }
if ($script:starts -ne 0 -or $script:hostQueries -ne 0 -or $script:listenerQueries -ne 0) {
    throw 'An initial query that exhausts the budget must not start the service or inspect endpoints.'
}
Reset-StartupFixture
$script:owner = '"C:\Other installation\tools\sunshinesvc.exe"'
Assert-Fails { Start-OwnedApolloService | Out-Null }
if ($script:starts -ne 0) { throw 'A foreign service must never be started.' }
Write-Output 'Service startup regressions passed without changing services, processes or network endpoints.'
