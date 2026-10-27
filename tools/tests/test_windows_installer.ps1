#requires -Version 7.0
param([Parameter(Mandatory = $true)][string]$Archive, [Parameter(Mandatory = $true)][string]$Installer,
      [switch]$HostIntegration)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:GITHUB_REPOSITORY -cne 'matheuspergoli/Apollo' -or -not $IsWindows) {
    throw 'Installer integration is restricted to the disposable Windows runner of this fork.'
}
if (Get-Service ApolloService -ErrorAction SilentlyContinue) { throw 'An existing Apollo service prevents an isolated test.' }
if (Get-CimInstance Win32_Process -Filter "Name='sunshine.exe'") { throw 'An existing host prevents clean qualification.' }
if ($HostIntegration -and (Get-CimInstance Win32_OperatingSystem).ProductType -ne 1) {
    throw 'Full host installation requires a disposable Windows client OS; Server CI does not qualify that path.'
}
if (Get-CimInstance Win32_PnPEntity | Where-Object { @($_.HardwareID) -contains 'ROOT\SudoMaker\SudoVDA' -or @($_.HardwareID) -contains 'SudoVDA' }) {
    throw 'A pre-existing SudoVDA adapter prevents a clean-install qualification.'
}
$work = Join-Path $env:RUNNER_TEMP ('apollo-installer-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$managed = Join-Path $work 'Managed installation'
$targetVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../package.json') -Raw | ConvertFrom-Json).version

function Invoke-Installer([string]$Root, [switch]$NoIntegration) {
    $arguments = '/S '
    if ($NoIntegration) { $arguments += '/NoHostIntegration ' }
    # NSIS /D must be last, without quoting its value, including spaces.
    $arguments += '/D=' + $Root
    Write-Output "Starting installer qualification; NoHostIntegration=$NoIntegration"
    $process = Start-Process -FilePath ([IO.Path]::GetFullPath($Installer)) -ArgumentList $arguments -PassThru
    if (-not $process.WaitForExit(240000)) {
        $windows = @(Get-Process | Where-Object { $_.MainWindowTitle -match 'Apollo' } | Select-Object Id, ProcessName, MainWindowTitle)
        $windows | ConvertTo-Json | Write-Output
        $process.Kill()
        throw 'Installer exceeded its bounded deadline; release qualification is blocked.'
    }
    if ($process.ExitCode -ne 0) { throw "Installer integration failed or requires reboot: $($process.ExitCode)" }
}
function Invoke-ServiceHelper([string]$Mode, [switch]$UpdateState) {
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        (Join-Path $managed 'scripts\update-installation.ps1'), '-InstallDir', $managed, '-Mode', $Mode)
    if ($UpdateState) {
        $arguments += @('-StatePath', (Join-Path $work 'service-update.json'), '-Version', $targetVersion,
            '-ManifestPath', (Join-Path $managed 'installation-manifest.json'))
    }
    & powershell.exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "Apollo service helper failed: $Mode" }
}
function Get-ServiceHost([string]$Root) {
    $service = Get-CimInstance Win32_Service -Filter "Name='ApolloService'"
    if (-not $service) { throw 'Expected the installed Apollo service.' }
    $hosts = @(Get-CimInstance Win32_Process -Filter "Name='sunshine.exe'" | Where-Object {
        $_.ExecutablePath -ieq (Join-Path $Root 'sunshine.exe') -and $_.ParentProcessId -eq $service.ProcessId
    })
    if ($hosts.Count -ne 1) { throw 'Expected exactly one host supervised by the installed service.' }
    return $hosts[0]
}
function Invoke-TestApi([string]$Path, [string]$Method = 'GET', [object]$Body = $null, $Session = $null) {
    $options = @{ Uri = 'https://127.0.0.1:50990/api/' + $Path; Method = $Method; SkipCertificateCheck = $true; TimeoutSec = 10; SkipHttpErrorCheck = $true }
    if ($Body) { $options.ContentType = 'application/json'; $options.Body = ConvertTo-Json $Body -Depth 8 }
    if ($Session) { $options.WebSession = $Session }
    return Invoke-WebRequest @options
}
function Uninstall-TestCopy([string]$Root) {
    $uninstaller = Join-Path $Root 'Uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru
        if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'Uninstaller exceeded its bounded deadline.' }
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            if (-not (Test-Path -LiteralPath $uninstaller)) { break }
            Start-Sleep -Seconds 1
        }
        if (Test-Path -LiteralPath $uninstaller) { throw 'Uninstaller launcher exited without completing removal.' }
        if ($process.ExitCode -ne 0) { throw 'Test-copy uninstallation failed.' }
    }
}

try {
    Expand-Archive -LiteralPath ([IO.Path]::GetFullPath($Archive)) -DestinationPath (Join-Path $work 'candidate')
    $candidate = Join-Path $work 'candidate\Apollo'
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $candidate 'drivers\sudovda\install-driver.ps1') -ValidateOnly
    if ($LASTEXITCODE -ne 0) { throw 'The packaged driver failed validation before installation.' }
    $broken = Join-Path $work 'incomplete\drivers'
    New-Item -ItemType Directory -Path $broken -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $candidate 'drivers\sudovda') -Destination $broken -Recurse
    $brokenDriver = Join-Path $broken 'sudovda'
    Remove-Item -LiteralPath (Join-Path $brokenDriver 'SudoVDA.dll'), (Join-Path $brokenDriver 'nefconc.exe')
    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new((Join-Path $brokenDriver 'sudovda.cer'))
    $trustedBefore = @{}
    foreach ($store in @('Root', 'TrustedPublisher')) { $trustedBefore[$store] = Test-Path "Cert:\LocalMachine\$store\$($cert.Thumbprint)" }
    $invalid = Start-Process -FilePath $env:ComSpec -ArgumentList ('/D /C ""' + (Join-Path $brokenDriver 'install.bat') + '""') -PassThru
    if (-not $invalid.WaitForExit(30000)) { $invalid.Kill(); throw 'Incomplete driver validation did not terminate.' }
    if ($invalid.ExitCode -eq 0) { throw 'An incomplete driver installer incorrectly reported success.' }
    foreach ($store in @('Root', 'TrustedPublisher')) {
        if ((Test-Path "Cert:\LocalMachine\$store\$($cert.Thumbprint)") -ne $trustedBefore[$store]) {
            throw 'An incomplete payload changed certificate trust before failing.'
        }
    }
    Write-Output 'Incomplete driver payload was rejected without changing certificate trust.'

    $previousReleases = @(
        @{ Version = '1.0.0'; Sha256 = 'cac2d5bd17fe14489b07acd96fc7f7568641dccbc3cb09d914af5fd8aa5b6f54' },
        @{ Version = '1.0.1'; Sha256 = 'f2dd3fb9242867e8816b1a8e990df51f4a14a3fa766a5eebfb20799816dea1d0' }
    )
    foreach ($release in $previousReleases) {
        $version = $release.Version
        $oldZip = Join-Path $work "Apollo-$version.zip"
        Invoke-WebRequest -Uri "https://github.com/matheuspergoli/Apollo/releases/download/v$version/Apollo-$version-Windows-x64.zip" -OutFile $oldZip
        if ((Get-FileHash $oldZip).Hash -ine $release.Sha256) {
            throw "The released $version fixture differs from its pinned artifact."
        }
        $old = Join-Path $work "old-$version"
        Expand-Archive -LiteralPath $oldZip -DestinationPath $old
        $app = Join-Path $work "Upgrade $version with spaces"
        Move-Item -LiteralPath (Join-Path $old 'Apollo') -Destination $app
        New-Item -ItemType Directory -Path (Join-Path $app 'config\credentials') -Force | Out-Null
        $fixtures = @('config\sunshine.conf', 'config\apps.json', 'config\sunshine_state.json', 'config\credentials\server.key', 'config\unknown.bin')
        $hashes = @{}
        foreach ($name in $fixtures) {
            $file = Join-Path $app $name
            [IO.File]::WriteAllBytes($file, [byte[]](0..255))
            $hashes[$name] = (Get-FileHash $file).Hash
        }
        Invoke-Installer -Root $app -NoIntegration
        foreach ($name in $fixtures) {
            if ((Get-FileHash (Join-Path $app $name)).Hash -ne $hashes[$name]) { throw "Upgrade changed fixture data: $name" }
        }
        if (Get-Service ApolloService -ErrorAction SilentlyContinue) { throw 'NoHostIntegration unexpectedly installed a service.' }
        if ((Get-Item (Join-Path $app 'sunshine.exe')).VersionInfo.ProductVersion -ne $targetVersion) {
            throw 'The old executable was not upgraded.'
        }
        Uninstall-TestCopy $app
        foreach ($name in $fixtures) {
            if ((Get-FileHash (Join-Path $app $name)).Hash -ne $hashes[$name]) { throw 'Uninstall removed existing data.' }
        }
        Write-Output "Real NSIS $version upgrade and uninstall preserved all data fixtures byte-for-byte."
    }

    if (-not $HostIntegration) { Copy-Item -LiteralPath $candidate -Destination $managed -Recurse }
    New-Item -ItemType Directory -Path (Join-Path $managed 'config') -Force | Out-Null
    $config = "port = 50989`nsunshine_name = CI managed host`nsystem_tray = disabled`nenable_discovery = disabled`nupnp = disabled`nheadless_mode = disabled`nignore_encoder_probe_failure = enabled`nnvenc_realtime_hags = disabled`nnvenc_latency_over_power = disabled`nnvenc_opengl_vulkan_on_dxgi = disabled`n"
    [IO.File]::WriteAllText((Join-Path $managed 'config\sunshine.conf'), $config, [Text.UTF8Encoding]::new($false))
    if ($HostIntegration) {
        Invoke-Installer -Root $managed
    } else {
        # Exercise Apollo's shipped service helper directly, not a mock installer
        # or an extracted vendor driver. NoHostIntegration above tests real NSIS.
        Invoke-ServiceHelper 'Service'
    }
    $credentials = @{ username = 'ci-installer'; password = 'CI-only non-production password' }
    $created = Invoke-TestApi 'password' 'POST' @{ newUsername = $credentials.username; newPassword = $credentials.password; confirmNewPassword = $credentials.password; currentUsername = ''; currentPassword = '' }
    if ($created.StatusCode -ne 200) { throw 'The installed service did not accept initial account setup.' }
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    if ((Invoke-TestApi 'login' 'POST' $credentials $session).StatusCode -ne 200) { throw 'Installed-host login failed.' }
    $info = (Invoke-TestApi 'config' 'GET' $null $session).Content | ConvertFrom-Json
    if ($info.version -ne $targetVersion) { throw 'Unexpected installed host version.' }
    if ($HostIntegration -and $info.vdisplayStatus -ne 0) { throw 'Apollo did not initialize the installed virtual display integration.' }
    if (-not $HostIntegration -and $info.vdisplayStatus -ne -1) { throw 'Expected Apollo to report FAILED for its unavailable virtual display dependency.' }

    Set-Service ApolloService -StartupType Manual
    $dataHashes = @{}
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $managed 'config') -Recurse -File | Where-Object { $_.Extension -in @('.conf', '.json', '.pem', '.key') }) {
        $dataHashes[$file.FullName] = (Get-FileHash $file.FullName).Hash
    }
    if ($HostIntegration) {
        Invoke-Installer -Root $managed
    } else {
        Invoke-ServiceHelper 'Prepare' -UpdateState
        Invoke-ServiceHelper 'Finish' -UpdateState
    }
    if ((Get-Service ApolloService).StartType -ne 'Manual') { throw 'Repair changed the saved service start preference.' }
    foreach ($file in $dataHashes.Keys) {
        if ((Get-FileHash $file).Hash -ne $dataHashes[$file]) { throw 'Managed repair changed existing state or credentials.' }
    }
    if ((Invoke-TestApi 'login' 'POST' $credentials $session).StatusCode -ne 200) { throw 'Repair invalidated the saved account.' }
    $before = Get-ServiceHost $managed
    $ack = Invoke-TestApi 'restart' 'POST' @{} $session
    if ($ack.StatusCode -ne 200 -or -not ($ack.Content | ConvertFrom-Json).accepted) { throw 'Service restart was not acknowledged.' }
    $returned = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try {
            $after = Get-ServiceHost $managed
            if ($after.ProcessId -ne $before.ProcessId) {
                $response = Invoke-TestApi 'config'
                if ($response.StatusCode -eq 401) { $returned = $true; break }
            }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $returned) { throw 'Service restart did not return a new responding host.' }
    if ($HostIntegration) { Uninstall-TestCopy $managed } else { Invoke-ServiceHelper 'RemoveService' }
    Write-Output 'Apollo installer data preservation and service/account/start-mode/restart contracts passed.'
    if (-not $HostIntegration) {
        Write-Output 'Vendor driver installation and hardware/streaming integration were not exercised by this run.'
    }
} catch {
    $failure = $_
    $diagnostics = @('Installer qualification failed: ' + $failure.Exception.Message)
    $diagnostics += (Get-CimInstance Win32_Service -Filter "Name='ApolloService'" | Select-Object State, StartMode, PathName, ProcessId | ConvertTo-Json)
    $diagnostics += (Get-CimInstance Win32_PnPEntity | Where-Object { @($_.HardwareID) -contains 'ROOT\SudoMaker\SudoVDA' } | Select-Object Name, Status, ConfigManagerErrorCode | ConvertTo-Json)
    $log = Join-Path $managed 'config\sunshine.log'
    if (Test-Path -LiteralPath $log) { $diagnostics += Get-Content -LiteralPath $log -Tail 80 }
    $diagnostics | Set-Content -LiteralPath 'installer-test.log' -Encoding utf8
    throw $failure
} finally {
    # Never touch a pre-existing service. This guard ran before any installation.
    if ((Test-Path -LiteralPath (Join-Path $managed 'scripts\update-installation.ps1'))) {
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $managed 'scripts\update-installation.ps1') -InstallDir $managed -Mode RemoveService
    }
}
