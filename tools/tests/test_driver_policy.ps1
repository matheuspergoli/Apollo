$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot '../../src_assets/windows/drivers/sudovda/driver-policy.ps1')

$version = [version]'1.10.9.289'
if ((Get-SudoVdaInstallDecision -Devices @() -BundledVersion $version) -ne 'Install') { throw 'Missing device policy failed' }
foreach ($existing in @('1.10.9.289', '2.0.0.0')) {
    $state = @([pscustomobject]@{ ProblemCode = 0; DriverVersion = $existing })
    if ((Get-SudoVdaInstallDecision -Devices $state -BundledVersion $version) -ne 'Keep') { throw 'Healthy/newer device must be preserved' }
}
$older = @([pscustomobject]@{ ProblemCode = 0; DriverVersion = '1.0.0.0' })
if ((Get-SudoVdaInstallDecision -Devices $older -BundledVersion $version) -ne 'Update') { throw 'Older version policy failed' }
foreach ($state in @(
    @([pscustomobject]@{ ProblemCode = 22; DriverVersion = '1.0.0.0' }),
    @([pscustomobject]@{ ProblemCode = 31; DriverVersion = '1.0.0.0' }),
    @([pscustomobject]@{ ProblemCode = 0; DriverVersion = $null }),
    @([pscustomobject]@{ ProblemCode = 0; DriverVersion = 'invalid' }),
    @($older[0], $older[0])
)) {
    $blocked = $false
    try { Get-SudoVdaInstallDecision -Devices $state -BundledVersion $version | Out-Null } catch { $blocked = $true }
    if (-not $blocked) { throw 'Ambiguous, disabled or failed device must block automatic changes' }
}
Write-Output 'Driver policy tests passed without modifying drivers, certificates, services or devices.'
