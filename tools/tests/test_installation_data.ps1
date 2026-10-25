$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot '../../src_assets/windows/misc/migration/installation-data.ps1')

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('apollo-data-' + [guid]::NewGuid().ToString('N'))
$app = Join-Path $testRoot 'Application with spaces'
New-Item -ItemType Directory -Path (Join-Path $app 'config\credentials') -Force | Out-Null
try {
    $paths = @('config\sunshine.conf', 'config\apps.json', 'config\sunshine_state.json', 'config\credentials\server.key', 'config\unknown.bin')
    foreach ($path in $paths) {
        [IO.File]::WriteAllBytes((Join-Path $app $path), [byte[]](0..255))
    }
    [IO.File]::WriteAllText((Join-Path $app 'sunshine.exe'), 'snapshot fixture, never executed')
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
