$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot '../../src_assets/windows/misc/migration/installation-data.ps1')
$securityModule = Get-Module Microsoft.PowerShell.Security
$expectedModule = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
if (-not $securityModule -or $securityModule.Path -ine $expectedModule) {
    throw 'Backup ACL commands must come from the current PowerShell engine.'
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('apollo-data-' + [guid]::NewGuid().ToString('N'))
$app = Join-Path $testRoot 'Application with spaces'
New-Item -ItemType Directory -Path (Join-Path $app 'config\credentials') -Force | Out-Null
try {
    $paths = @('config\sunshine.conf', 'config\apps.json', 'config\sunshine_state.json', 'config\credentials\server.key', 'config\unknown.bin')
    foreach ($path in $paths) {
        [IO.File]::WriteAllBytes((Join-Path $app $path), [byte[]](0..255))
    }
    [IO.File]::WriteAllText((Join-Path $app 'sunshine.exe'), 'snapshot fixture, never executed')
    [IO.File]::WriteAllText((Join-Path $app 'config\sunshine.log'), 'previous host log')
    $beforeAcl = (Get-Acl -LiteralPath (Join-Path $app 'config')).Sddl
    $snapshot = New-InstallationSnapshot $app
    Test-InstallationSnapshot -Snapshot $snapshot -InstallDir $app
    Assert-InstallationDataPreserved $snapshot
    if (-not (Get-Acl -LiteralPath $snapshot.Backup).AreAccessRulesProtected) { throw 'Backup ACL must be private' }
    $allowed = @('S-1-5-18', 'S-1-5-32-544', [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
    foreach ($backupFile in Get-ChildItem -LiteralPath $snapshot.Backup -Recurse -File) {
        foreach ($rule in (Get-Acl -LiteralPath $backupFile.FullName).Access) {
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($sid -notin $allowed) { throw 'Backup file grants access outside the private backup principals' }
        }
    }
    if ((Get-Acl -LiteralPath (Join-Path $app 'config')).Sddl -ne $beforeAcl) { throw 'Original data ACL changed' }

    [IO.File]::WriteAllText((Join-Path $app 'sunshine.exe'), 'new binary fixture')
    Assert-InstallationDataPreserved $snapshot
    [IO.File]::WriteAllText((Join-Path $app 'config\apps.json'), 'unexpected mutation')
    $blocked = $false
    try { Assert-InstallationDataPreserved $snapshot } catch { $blocked = $true }
    if (-not $blocked) { throw 'Data mutation must block installation success' }
    Restore-InstallationSnapshot -Snapshot $snapshot -InstallDir $app
    Assert-InstallationDataPreserved $snapshot
    if ([IO.File]::ReadAllText((Join-Path $app 'sunshine.exe')) -ne 'snapshot fixture, never executed') {
        throw 'Previous executable bytes were not restored'
    }

    # A failed candidate's evidence must survive restoration of the previous log.
    $statePath = Join-Path $testRoot 'update-state.json'
    Write-InstallJson -Path $statePath -Value ([pscustomobject]@{ Snapshot = $snapshot })
    . (Join-Path $PSScriptRoot '../../src_assets/windows/misc/migration/update-installation.ps1') -InstallDir $app -Mode Finish -StatePath $statePath
    $script:startupObservation = [pscustomobject]@{ ExpectedPort = 47990; ServiceProcessId = 501 }
    [IO.File]::WriteAllText((Join-Path $app 'config\sunshine.log'), 'candidate startup failure fixture')
    Save-InstallationFailure -Failure 'startup not confirmed fixture' | Out-Null
    $diagnostic = @(Get-ChildItem -LiteralPath $snapshot.Backup -Directory -Filter 'failure-Finish-*')
    if ($diagnostic.Count -ne 1) { throw 'Expected a separate failure evidence directory.' }
    Restore-InstallationSnapshot -Snapshot $snapshot -InstallDir $app
    if ([IO.File]::ReadAllText((Join-Path $app 'config\sunshine.log')) -ne 'previous host log') { throw 'Previous log was not restored.' }
    if ((Get-Content -LiteralPath (Join-Path $diagnostic[0].FullName 'host.log') -Raw).Trim() -ne 'candidate startup failure fixture') {
        throw 'Rollback erased candidate failure evidence.'
    }
    $report = Get-Content -LiteralPath (Join-Path $diagnostic[0].FullName 'failure.json') -Raw | ConvertFrom-Json
    if ($report.Mode -ne 'Finish' -or $report.Startup.ServiceProcessId -ne 501) { throw 'Failure report lost stage or startup identity.' }
    foreach ($file in Get-ChildItem -LiteralPath $diagnostic[0].FullName -File) {
        foreach ($rule in (Get-Acl -LiteralPath $file.FullName).Access) {
            if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed) {
                throw 'Failure evidence must remain private.'
            }
        }
    }

    $entry = $snapshot.Files[0]
    $originalPath = $entry.Path
    $entry.Path = '..\escape'
    $blocked = $false
    try { Test-InstallationSnapshot -Snapshot $snapshot -InstallDir $app } catch { $blocked = $true }
    if (-not $blocked) { throw 'Traversal in snapshot must be rejected' }
    $entry.Path = $originalPath
    $backupFile = Get-ContainedInstallPath (Join-Path $snapshot.Backup 'files') $entry.Path
    [IO.File]::WriteAllText($backupFile, 'corrupted snapshot')
    $blocked = $false
    try { Restore-InstallationSnapshot -Snapshot $snapshot -InstallDir $app } catch { $blocked = $true }
    if (-not $blocked) { throw 'Corrupt backup must not be restored' }
    Write-Output 'Installation data tests passed: byte preservation, private backups, ACL preservation, restoration and rejection of tampering.'
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
