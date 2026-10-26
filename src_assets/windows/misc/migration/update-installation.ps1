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
    $service = Get-CimInstance Win32_Service -Filter "Name='ApolloService'"
    if (-not $service) { return $null }
    $command = $service.PathName.Trim()
    if ($command -ne ('"' + $serviceBinary + '"') -and $command -ne $serviceBinary) {
        throw 'ApolloService belongs to another installation or has an ambiguous command. No service was changed.'
    }
    return $service
}

function Get-OwnedHostProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name='sunshine.exe'" | Where-Object {
        if (-not $_.ExecutablePath) { throw 'Cannot establish the path of a running host; close it before updating.' }
        $_.ExecutablePath -ieq $hostBinary
    })
}

function Stop-OwnedApolloService {
    $service = Get-OwnedApolloService
    if ($service -and $service.State -ne 'Stopped') {
        Stop-Service -Name ApolloService -ErrorAction Stop
        (Get-Service ApolloService).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
    }
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (@(Get-OwnedHostProcesses).Count -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw 'The host is still using this installation. Close it before updating; no forced termination was attempted.'
}

function Start-OwnedApolloService {
    $service = Get-OwnedApolloService
    if (-not $service) { throw 'ApolloService is absent.' }
    if ($service.StartMode -eq 'Disabled') { throw 'ApolloService is disabled; refusing to override this preference.' }
    Start-Service ApolloService -ErrorAction Stop
    (Get-Service ApolloService).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
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
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        $hosts = @(Get-OwnedHostProcesses | Where-Object { $_.ParentProcessId -eq $service.ProcessId })
        # Refresh the SCM PID after starting a previously stopped service.
        $service = Get-OwnedApolloService
        if ($hosts.Count -eq 1) {
            $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
                $_.OwningProcess -eq $hosts[0].ProcessId -and $_.LocalPort -eq $webPort
            })
            if ($listeners.Count -gt 0) { return }
        }
        Start-Sleep -Seconds 1
    }
    throw 'The service started but its host did not open a listening endpoint. Installation is not confirmed.'
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
    # If preparation stopped the old service but could not create its backup,
    # restore availability without copying or deleting application data.
    if ($Mode -eq 'Prepare' -and (Get-Variable wasRunning -ErrorAction SilentlyContinue) -and $wasRunning) {
        try { Start-OwnedApolloService } catch { Write-Warning 'The previous service requires manual recovery.' }
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
}
