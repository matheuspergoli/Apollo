[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'driver-policy.ps1')

function Get-SudoVdaDevices {
    @(Get-CimInstance Win32_PnPEntity | Where-Object {
        $_.Present -and (@($_.HardwareID) -contains 'ROOT\SudoMaker\SudoVDA' -or @($_.HardwareID) -contains 'SudoVDA')
    })
}

function Test-SudoVdaInterface {
    $probe = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\tools\sudovda-status.exe'))
    if (-not (Test-Path -LiteralPath $probe -PathType Leaf)) { throw 'The read-only driver probe is missing.' }
    $process = New-Object Diagnostics.Process
    $process.StartInfo.FileName = $probe
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    try {
        $process.Start() | Out-Null
        if (-not $process.WaitForExit(5000)) {
            $process.Kill()
            throw 'Driver interface query timed out. Readiness is not confirmed.'
        }
        $output = $process.StandardOutput.ReadToEnd()
        if ($process.ExitCode -ne 0) { Write-Warning $output; return $false }
        return $true
    } finally { $process.Dispose() }
}

try {
    $contract = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-contract.json') -Raw | ConvertFrom-Json
    foreach ($name in @('SudoVDA.dll', 'SudoVDA.inf', 'sudovda.cat', 'sudovda.cer', 'nefconc.exe')) {
        $file = Join-Path $PSScriptRoot $name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing required driver file: $name" }
        $expected = $contract.sha256.PSObject.Properties["drivers/sudovda/$name"].Value
        if ($expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $expected) {
            throw "Driver file does not match the approved package: $name"
        }
    }
    $version = [version]$contract.sudovdaSource.driverVersion
    $inf = Join-Path $PSScriptRoot 'SudoVDA.inf'
    $infText = [IO.File]::ReadAllText($inf)
    if ($infText -notmatch "(?im)^DriverVer\s*=\s*[^,]+,$([regex]::Escape($version.ToString()))\s*$") {
        throw 'INF version does not match the approved driver version.'
    }
    if ($ValidateOnly) {
        Write-Output "Verified SudoVDA package $version; no driver, certificate or service was changed."
        exit 0
    }
    $probePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\tools\sudovda-status.exe'))
    if (-not (Test-Path -LiteralPath $probePath -PathType Leaf)) { throw 'The required driver interface probe is missing.' }

    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Driver installation requires administrator approval.'
    }
    $devices = @(Get-SudoVdaDevices)
    $states = @($devices | ForEach-Object {
        $id = $_.PNPDeviceID
        $driver = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceID -eq $id })
        [pscustomobject]@{ ProblemCode = $_.ConfigManagerErrorCode; DriverVersion = if ($driver.Count -eq 1) { $driver[0].DriverVersion } else { $null } }
    })
    $decision = Get-SudoVdaInstallDecision -Devices $states -BundledVersion $version
    if ($decision -eq 'Keep') {
        if (-not (Test-SudoVdaInterface)) { throw 'Existing driver has a healthy PnP node but its interface is not ready.' }
        Write-Output 'Existing SudoVDA adapter is healthy and its version is equal or newer; left unchanged.'
        exit 0
    }

    $certificatePath = Join-Path $PSScriptRoot 'sudovda.cer'
    $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($certificatePath)
    foreach ($store in @('Root', 'TrustedPublisher')) {
        if (-not (Test-Path "Cert:\LocalMachine\$store\$($certificate.Thumbprint)")) {
            Write-Output "Trusting the verified SudoVDA certificate $($certificate.Thumbprint) in LocalMachine/$store."
            Import-Certificate -FilePath $certificatePath -CertStoreLocation "Cert:\LocalMachine\$store" | Out-Null
        }
    }

    # Stage before creating a missing node. Never remove an existing adapter or
    # force an older package over a newer one selected by Windows.
    $pnputil = Join-Path $env:SystemRoot 'System32\pnputil.exe'
    & $pnputil /add-driver $inf /install
    if ($LASTEXITCODE -notin @(0, 3010)) { throw "Driver staging failed: $LASTEXITCODE" }
    $rebootRequired = $LASTEXITCODE -eq 3010
    if ($decision -eq 'Install') {
        & (Join-Path $PSScriptRoot 'nefconc.exe') --create-device-node --class-name Display --class-guid '4D36E968-E325-11CE-BFC1-08002BE10318' --hardware-id 'root\sudomaker\sudovda'
        if ($LASTEXITCODE -notin @(0, 3010)) { throw "Device creation failed: $LASTEXITCODE" }
        $rebootRequired = $rebootRequired -or $LASTEXITCODE -eq 3010
        & $pnputil /add-driver $inf /install
        if ($LASTEXITCODE -notin @(0, 3010)) { throw "Driver binding failed: $LASTEXITCODE" }
        $rebootRequired = $rebootRequired -or $LASTEXITCODE -eq 3010
    }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $live = @(Get-SudoVdaDevices)
        if ($live.Count -eq 1 -and $live[0].ConfigManagerErrorCode -eq 0) {
            $activeId = $live[0].PNPDeviceID
            $activeDriver = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceID -eq $activeId })
            if ($activeDriver.Count -eq 1 -and $activeDriver[0].DriverVersion -and [version]$activeDriver[0].DriverVersion -ge $version) {
                if (Test-SudoVdaInterface) {
                    Write-Output 'SudoVDA PnP adapter, active version and driver interface are ready.'
                    exit 0
                }
            }
        }
        Start-Sleep -Seconds 1
    }
    if ($rebootRequired) { Write-Warning 'Windows requires a restart before driver readiness can be verified.'; exit 3010 }
    throw 'SudoVDA did not reach a healthy PnP state. Installation is not confirmed; no existing adapter was deleted.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
