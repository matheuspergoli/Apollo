[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [Parameter(Mandatory = $true)][ValidateSet('Prepare', 'Verify', 'Finish', 'Restore', 'Service', 'RemoveService')][string]$Mode,
    [string]$StatePath,
    [string]$Version,
    [string]$ManifestPath,
    [switch]$DeferStart,
    [switch]$NoHostIntegration
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'installation-data.ps1')
$root = Get-LocalInstallRoot $InstallDir
$serviceBinary = Join-Path $root 'tools\sunshinesvc.exe'
$hostBinary = Join-Path $root 'sunshine.exe'

function Get-OwnedApolloService {
    param([int]$OperationTimeoutSec = 60)
    $service = Get-CimInstance Win32_Service -Filter "Name='ApolloService'" -OperationTimeoutSec $OperationTimeoutSec
    if (-not $service) { return $null }
    $command = $service.PathName.Trim()
    if ($command -ne ('"' + $serviceBinary + '"') -and $command -ne $serviceBinary) {
        throw 'ApolloService belongs to another installation or has an ambiguous command. No service was changed.'
    }
    return $service
}

function Get-OwnedHostProcesses {
    param([int]$OperationTimeoutSec = 60)
    @(Get-CimInstance Win32_Process -Filter "Name='sunshine.exe'" -OperationTimeoutSec $OperationTimeoutSec | Where-Object {
        if (-not $_.ExecutablePath) { throw 'Cannot establish the path of a running host; close it before updating.' }
        $_.ExecutablePath -ieq $hostBinary
    })
}

function Stop-OwnedApolloService {
    param([TimeSpan]$Timeout = [TimeSpan]::FromSeconds(60))
    if ($Timeout -le [TimeSpan]::Zero) { throw 'Service stop timeout must be positive.' }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $service = Get-OwnedApolloService -OperationTimeoutSec ([int][Math]::Ceiling($Timeout.TotalSeconds))
    if ($service -and $service.State -ne 'Stopped') {
        $remaining = $Timeout - $clock.Elapsed
        if ($remaining -le [TimeSpan]::Zero) { throw 'Timed out before requesting the owned service to stop.' }
        # Request only this service to stop; do not let Stop-Service wait before
        # our deadline starts or stop dependent services from other installations.
        $result = Invoke-CimMethod -InputObject $service -MethodName StopService -OperationTimeoutSec ([int][Math]::Ceiling($remaining.TotalSeconds))
        if ($result.ReturnValue -notin @(0, 6)) { throw "Owned service stop request failed: $($result.ReturnValue)" }
        Write-Output 'Waiting for the owned Apollo service and host to stop within the update deadline.'
    }
    while ($clock.Elapsed -lt $Timeout) {
        $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
        $service = Get-OwnedApolloService -OperationTimeoutSec $seconds
        if (-not $service -or $service.State -eq 'Stopped') {
            if ($clock.Elapsed -ge $Timeout) { break }
            $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
            if (@(Get-OwnedHostProcesses -OperationTimeoutSec $seconds).Count -eq 0) {
                if ($clock.Elapsed -lt $Timeout) { return }
                break
            }
        }
        $remaining = ($Timeout - $clock.Elapsed).TotalMilliseconds
        if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Min(1000, $remaining)) }
    }
    throw 'Timed out waiting for the owned service or host to stop. Program files were not released; no forced termination was attempted.'
}

function Test-ApolloTcpEndpoint {
    param([string]$Address, [int]$Port, [int]$TimeoutMilliseconds)
    if ($TimeoutMilliseconds -le 0) { return $false }
    $ip = [Net.IPAddress]::Parse($Address)
    if ($ip.Equals([Net.IPAddress]::Any)) { $ip = [Net.IPAddress]::Loopback }
    if ($ip.Equals([Net.IPAddress]::IPv6Any)) { $ip = [Net.IPAddress]::IPv6Loopback }
    $client = New-Object Net.Sockets.TcpClient($ip.AddressFamily)
    $wait = $null
    try {
        $pending = $client.BeginConnect($ip, $Port, $null, $null)
        $wait = $pending.AsyncWaitHandle
        if (-not $wait.WaitOne($TimeoutMilliseconds)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch [Net.Sockets.SocketException] {
        return $false
    } finally {
        $client.Dispose()
        if ($wait) { $wait.Dispose() }
    }
}

function Start-OwnedApolloService {
    param([TimeSpan]$Timeout = [TimeSpan]::FromSeconds(90))
    $script:startupObservation = $null
    if ($Timeout -le [TimeSpan]::Zero) { throw 'Service startup timeout must be positive.' }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $service = Get-OwnedApolloService -OperationTimeoutSec ([int][Math]::Ceiling($Timeout.TotalSeconds))
    if (-not $service) { throw 'ApolloService is absent.' }
    if ($service.StartMode -eq 'Disabled') { throw 'ApolloService is disabled; refusing to override this preference.' }
    if ($clock.Elapsed -ge $Timeout) { throw 'Startup budget exhausted while identifying the owned service; no start was requested.' }
    $webPort = 47990
    $configPath = Join-Path $root 'config\sunshine.conf'
    if (Test-Path -LiteralPath $configPath) {
        foreach ($line in [IO.File]::ReadAllLines($configPath)) {
            if ($line -cmatch '^\s*port\s*=\s*(\d+)\s*(?:#.*)?$') {
                $basePort = [int]$Matches[1]
                if ($basePort -lt 1029 -or $basePort -gt 65514) { throw 'Configured port is outside the supported range.' }
                $webPort = $basePort + 1
            }
        }
    }
    if ($clock.Elapsed -ge $Timeout) { throw 'Startup budget exhausted before requesting the owned service to start.' }
    Start-Service ApolloService -ErrorAction Stop
    Write-Output "Waiting for the owned Apollo host to listen on TCP port $webPort (startup budget: $($Timeout.TotalSeconds)s)."
    while ($clock.Elapsed -lt $Timeout) {
        $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
        # Always obtain the current supervisor PID before selecting its children.
        $service = Get-OwnedApolloService -OperationTimeoutSec $seconds
        if (-not $service) { throw 'ApolloService disappeared during startup.' }
        if ($clock.Elapsed -ge $Timeout) { break }
        $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
        $hosts = @(Get-OwnedHostProcesses -OperationTimeoutSec $seconds)
        $children = @($hosts | Where-Object { $_.ParentProcessId -eq $service.ProcessId })
        $script:startupObservation = [pscustomobject]@{
            ElapsedSeconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3)
            ServiceState = $service.State; ServiceProcessId = $service.ProcessId; ExpectedPort = $webPort
            Hosts = @($hosts | Select-Object ProcessId, ParentProcessId, ExecutablePath)
            Listeners = @()
            ConnectionAccepted = $false
        }
        if ($clock.Elapsed -ge $Timeout) { break }
        if ($service.State -eq 'Running' -and $service.ProcessId -ne 0 -and $children.Count -eq 1) {
            $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
            # Some Windows hosts report a working listener as Closed. State alone
            # cannot establish readiness: require the owned endpoint AND an
            # actual bounded connection to that address, without sending data or
            # weakening TLS/authentication. Bound-but-not-listening must fail.
            $listeners = @(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetTCPConnection -Filter "LocalPort=$webPort" -OperationTimeoutSec $seconds)
            $script:startupObservation.Listeners = @($listeners | Select-Object OwningProcess, LocalAddress, LocalPort, RemotePort, State)
            foreach ($listener in $listeners) {
                if ($listener.LocalPort -ne $webPort -or $listener.OwningProcess -ne $children[0].ProcessId -or $listener.RemotePort -ne 0) { continue }
                $remaining = [Math]::Floor(($Timeout - $clock.Elapsed).TotalMilliseconds)
                if ($remaining -le 0) { break }
                if (Test-ApolloTcpEndpoint -Address $listener.LocalAddress -Port $webPort -TimeoutMilliseconds ([int][Math]::Min(250, $remaining))) {
                    $script:startupObservation.ConnectionAccepted = $true
                    if ($clock.Elapsed -ge $Timeout) { break }
                    # Do not accept a connection across a supervisor restart.
                    $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
                    $verified = Get-OwnedApolloService -OperationTimeoutSec $seconds
                    if ($clock.Elapsed -ge $Timeout) { break }
                    if ($verified -and $verified.State -eq 'Running' -and $verified.ProcessId -eq $service.ProcessId) {
                        $seconds = [Math]::Max(1, [int][Math]::Ceiling(($Timeout - $clock.Elapsed).TotalSeconds))
                        $verifiedHosts = @(Get-OwnedHostProcesses -OperationTimeoutSec $seconds | Where-Object { $_.ParentProcessId -eq $verified.ProcessId })
                        if ($clock.Elapsed -lt $Timeout -and $verifiedHosts.Count -eq 1 -and $verifiedHosts[0].ProcessId -eq $children[0].ProcessId) { return }
                    }
                }
            }
        }
        $remaining = ($Timeout - $clock.Elapsed).TotalMilliseconds
        if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int][Math]::Min(1000, $remaining)) }
    }
    throw "Apollo startup was not confirmed on TCP port $webPort within the startup budget. Last observation: $(ConvertTo-Json -InputObject $script:startupObservation -Compress -Depth 5)"
}

function Save-InstallationFailure {
    param([object]$Failure)
    if (-not $StatePath -or -not (Test-Path -LiteralPath $StatePath)) { return }
    $saved = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    Test-InstallationSnapshot -Snapshot $saved.Snapshot -InstallDir $root
    $directory = Join-Path $saved.Snapshot.Backup ('failure-' + $Mode + '-' + [guid]::NewGuid().ToString('N'))
    New-PrivateInstallDirectory $directory
    $observation = if (Get-Variable startupObservation -Scope Script -ErrorAction SilentlyContinue) { $script:startupObservation } else { $null }
    Write-InstallJson -Path (Join-Path $directory 'failure.json') -Value ([pscustomobject]@{
        Mode = $Mode; Error = $Failure.ToString(); Startup = $observation
    })
    # Preserve the candidate's log before rollback replaces it with the old log.
    # Never copy configuration, credentials or pairing files into diagnostics.
    $log = Join-Path $root 'config\sunshine.log'
    if (Test-Path -LiteralPath $log -PathType Leaf) {
        try {
            Get-Content -LiteralPath $log -Tail 200 | Set-Content -LiteralPath (Join-Path $directory 'host.log') -Encoding UTF8
        } catch { Write-Warning 'The host log could not be captured; the installation error was retained.' }
    }
    Write-Output "Installation failure details preserved in $directory"
}

function Install-OwnedApolloService {
    $service = Get-OwnedApolloService
    if (-not $service) {
        if (-not (Test-Path -LiteralPath $serviceBinary -PathType Leaf)) { throw 'The service executable is missing.' }
        New-Service -Name ApolloService -BinaryPathName ('"' + $serviceBinary + '"') -DisplayName 'Apollo Service' -StartupType Automatic | Out-Null
    }
}

function Assert-OwnedRegistration {
    foreach ($key in @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Apollo', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Apollo')) {
        $entry = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($entry) {
            $expected = '"' + (Join-Path $root 'Uninstall.exe') + '"'
            if (-not $entry.UninstallString -or $entry.UninstallString -ine $expected) {
                throw 'Another Apollo installation is registered. Select its directory or use a manual ZIP deployment.'
            }
        }
    }
}

function Assert-InstalledProgram {
    if (-not $ManifestPath) { throw 'The installer must supply its embedded program manifest.' }
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($manifest.format -ne 'apollo-installed-files' -or $manifest.version -ne 1) { throw 'Unsupported program manifest.' }
    foreach ($entry in $manifest.files.PSObject.Properties) {
        $path = Get-ContainedInstallPath $root $entry.Name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path).Hash -ine $entry.Value) {
            throw "An installed program file is missing or differs from the installer: $($entry.Name)"
        }
    }
    $info = (Get-Item -LiteralPath $hostBinary).VersionInfo
    if ($info.ProductName -ne 'Apollo' -or $info.ProductVersion -ne $manifest.appVersion) { throw 'Installed executable version differs from the installer.' }
}

# Dot-sourcing exposes the same lifecycle functions without executing a CLI action.
if ($MyInvocation.InvocationName -eq '.') { return }

try {
    if ($Mode -eq 'Verify') { Assert-InstalledProgram; exit 0 }
    if ($Mode -eq 'Prepare') {
        if (-not $StatePath -or -not $Version) { throw 'Update preparation needs a private state path and target version.' }
        $service = Get-OwnedApolloService
        Assert-OwnedRegistration
        if ($NoHostIntegration -and $service) { throw 'A managed installation cannot skip its service lifecycle.' }
        $hadHost = Test-Path -LiteralPath $hostBinary -PathType Leaf
        if ($hadHost) {
            $info = (Get-Item -LiteralPath $hostBinary).VersionInfo
            if ($info.ProductName -ne 'Apollo' -or $info.ProductVersion -notmatch '^([0-9]+\.[0-9]+\.[0-9]+)') {
                throw 'The existing executable is not an identifiable Apollo installation.'
            }
            if ([version]$Matches[1] -gt [version]$Version) { throw 'Automatic downgrade is not supported.' }
        } elseif (Test-Path -LiteralPath $root) {
            $foreign = @(Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -ine 'config' })
            if ($foreign.Count -gt 0) { throw 'The target directory contains files unrelated to a recognized Apollo installation.' }
        }
        if (-not (Test-Path -LiteralPath (Join-Path $root 'config'))) {
            foreach ($legacy in @('sunshine.conf', 'apps.json', 'sunshine_state.json', 'credentials')) {
                if (Test-Path -LiteralPath (Join-Path $root $legacy)) {
                    throw 'Legacy root-level data needs explicit migration; no files were changed.'
                }
            }
        }
        $wasRunning = $service -and $service.State -eq 'Running'
        if ($wasRunning -and $service.StartMode -eq 'Disabled') { throw 'Resolve the running/disabled service state before updating.' }
        if ($service) { Stop-OwnedApolloService }
        if (@(Get-OwnedHostProcesses).Count -gt 0) { throw 'Close the standalone Apollo process before updating.' }
        $snapshot = New-InstallationSnapshot $root
        $state = [pscustomobject]@{
            Snapshot = $snapshot; HadHost = [bool]$hadHost; HadService = [bool]$service
            WasRunning = [bool]$wasRunning; NoHostIntegration = [bool]$NoHostIntegration
        }
        Write-InstallJson -Path $StatePath -Value $state
        Write-Output 'Private installation backup verified. Existing application data will not be migrated or overwritten.'
        exit 0
    }
    if ($Mode -in @('Finish', 'Restore')) {
        if (-not $StatePath) { throw 'Update state path is required.' }
        $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        Test-InstallationSnapshot -Snapshot $state.Snapshot -InstallDir $root
        if ($Mode -eq 'Restore') {
            if (-not $state.NoHostIntegration) { Stop-OwnedApolloService }
            Restore-InstallationSnapshot -Snapshot $state.Snapshot -InstallDir $root
            Write-Output 'Previous files restored from the verified private backup; service recovery is checked separately.'
            if (-not $state.HadService -and -not $state.NoHostIntegration) {
                $created = Get-OwnedApolloService
                if ($created) {
                    $deleted = Invoke-CimMethod -InputObject $created -MethodName Delete
                    if ($deleted.ReturnValue -ne 0) { throw 'Could not remove the service created by the failed installation.' }
                }
            }
            if ($state.HadService -and $state.WasRunning) { Start-OwnedApolloService }
            Write-Output 'Previous files restored from the verified private backup. Shared drivers were not removed.'
            exit 0
        }
        Assert-InstallationDataPreserved $state.Snapshot
        Assert-InstalledProgram
        if (-not $state.NoHostIntegration) {
            $config = Join-Path $root 'config'
            if (-not (Test-Path -LiteralPath $config)) { New-PrivateInstallDirectory $config }
            Install-OwnedApolloService
            if (-not $DeferStart -and (-not $state.HadService -or $state.WasRunning)) { Start-OwnedApolloService }
        }
        Write-Output 'Installation completed; existing configuration and pairing files were preserved.'
        exit 0
    }
    if ($Mode -eq 'Service') {
        Install-OwnedApolloService
        Start-OwnedApolloService
    } elseif ($Mode -eq 'RemoveService') {
        $service = Get-OwnedApolloService
        if ($service) {
            Stop-OwnedApolloService
            $result = Invoke-CimMethod -InputObject $service -MethodName Delete
            if ($result.ReturnValue -ne 0) { throw "Service deletion failed: $($result.ReturnValue)" }
        }
    }
    exit 0
} catch {
    $failure = $_
    try { Save-InstallationFailure -Failure $failure } catch { Write-Warning 'Could not retain installation failure diagnostics; the original error follows.' }
    # If preparation stopped the old service but could not create its backup,
    # restore availability without copying or deleting application data.
    if ($Mode -eq 'Prepare' -and (Get-Variable wasRunning -ErrorAction SilentlyContinue) -and $wasRunning) {
        try {
            $previous = Get-OwnedApolloService
            if ($previous -and $previous.State -eq 'Stopped' -and @(Get-OwnedHostProcesses).Count -eq 0) {
                Start-OwnedApolloService
            } else {
                Write-Warning 'The previous host is still running or stopping; no duplicate host was started.'
            }
        } catch { Write-Warning 'The previous service requires manual recovery.' }
    }
    Write-Error $failure -ErrorAction Continue
    exit 1
}
