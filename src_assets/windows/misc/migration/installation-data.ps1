# The installer can inherit a PowerShell 7 module path while launching Windows
# PowerShell 5.1. Load ACL commands from this engine, never a caller's module path.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop

function Get-LocalInstallRoot {
    param([string]$Path)
    $root = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($root.StartsWith('\\') -or $root -eq [IO.Path]::GetPathRoot($root).TrimEnd('\')) {
        throw 'Installation requires a local application directory, not a share or drive root.'
    }
    return $root
}

function New-PrivateInstallDirectory {
    param([string]$Path)
    New-Item -ItemType Directory -Path $Path -ErrorAction Stop | Out-Null
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $identities = @('S-1-5-18', 'S-1-5-32-544', [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
    foreach ($identity in ($identities | Select-Object -Unique)) {
        $sid = New-Object Security.Principal.SecurityIdentifier($identity)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Get-OrdinaryInstallFiles {
    param([string]$Root, [string]$Relative = '', [int]$Depth = 0)
    if ($Depth -gt 128) { throw 'Installation tree is too deeply nested.' }
    $path = if ($Relative) { Join-Path $Root $Relative } else { $Root }
    $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Links and junctions require a manual backup; refusing to follow them.'
    }
    if ($item.PSIsContainer) {
        foreach ($child in Get-ChildItem -LiteralPath $item.FullName -Force -ErrorAction Stop) {
            $next = if ($Relative) { Join-Path $Relative $child.Name } else { $child.Name }
            Get-OrdinaryInstallFiles -Root $Root -Relative $next -Depth ($Depth + 1)
        }
    } elseif ($Relative) {
        [pscustomobject]@{ Relative = $Relative; FullName = $item.FullName }
    }
}

function Get-ContainedInstallPath {
    param([string]$Root, [string]$Relative)
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative.Contains(':') -or ($Relative.Split('\/') -contains '..')) {
        throw 'Unsafe path in installation snapshot.'
    }
    $path = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $path.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Snapshot path escaped its application directory.'
    }
    return $path
}

function Copy-InstallBytes {
    param([string]$Source, [string]$Destination, [switch]$CreateNew)
    $parent = [IO.Path]::GetDirectoryName($Destination)
    [IO.Directory]::CreateDirectory($parent) | Out-Null
    $inputStream = [IO.File]::Open($Source, 'Open', 'Read', 'Read')
    try {
        $mode = if ($CreateNew) { [IO.FileMode]::CreateNew } else { [IO.FileMode]::Create }
        $outputStream = [IO.File]::Open($Destination, $mode, 'Write', 'None')
        try { $inputStream.CopyTo($outputStream); $outputStream.Flush() } finally { $outputStream.Dispose() }
        $inputStream.Position = 0
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try { $hash = ([BitConverter]::ToString($algorithm.ComputeHash($inputStream))).Replace('-', '').ToLowerInvariant() }
        finally { $algorithm.Dispose() }
    } finally { $inputStream.Dispose() }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ine $hash) {
        throw 'Installation snapshot copy did not preserve file bytes.'
    }
    return $hash
}

function Write-InstallJson {
    param([string]$Path, [object]$Value)
    $text = ConvertTo-Json -InputObject $Value -Depth 12
    [IO.File]::WriteAllText($Path, $text, (New-Object Text.UTF8Encoding($false)))
}

function New-InstallationSnapshot {
    param([string]$InstallDir)
    $root = Get-LocalInstallRoot $InstallDir
    $files = if (Test-Path -LiteralPath $root) { @(Get-OrdinaryInstallFiles -Root $root) } else { @() }
    $base = $root + '.backups'
    if (-not (Test-Path -LiteralPath $base)) { New-PrivateInstallDirectory $base }
    if ((Get-Item -LiteralPath $base -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Backup location must not be a link or junction.'
    }
    $backup = Join-Path $base ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N'))
    New-PrivateInstallDirectory $backup
    $data = Join-Path $backup 'files'
    New-Item -ItemType Directory -Path $data | Out-Null
    $entries = @()
    foreach ($file in $files) {
        $destination = Get-ContainedInstallPath $data $file.Relative
        $hash = Copy-InstallBytes -Source $file.FullName -Destination $destination -CreateNew
        $entries += [pscustomobject]@{ Path = $file.Relative; SHA256 = $hash }
    }
    $snapshot = [pscustomobject]@{ Format = 'apollo-installation-snapshot'; Version = 1; Root = $root; Backup = $backup; Files = $entries }
    Write-InstallJson -Path (Join-Path $backup 'snapshot.json') -Value $snapshot
    return $snapshot
}

function Test-InstallationSnapshot {
    param([object]$Snapshot, [string]$InstallDir)
    $root = Get-LocalInstallRoot $InstallDir
    if ($Snapshot.Format -ne 'apollo-installation-snapshot' -or $Snapshot.Version -ne 1 -or $Snapshot.Root -ine $root) {
        throw 'Snapshot does not belong to this installation.'
    }
    $backup = [IO.Path]::GetFullPath($Snapshot.Backup)
    if (-not $backup.StartsWith($root + '.backups\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Snapshot has an unexpected backup location.'
    }
    $data = Join-Path $backup 'files'
    @(Get-OrdinaryInstallFiles -Root $data) | Out-Null
    foreach ($entry in $Snapshot.Files) {
        $file = Get-ContainedInstallPath $data $entry.Path
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $entry.SHA256) {
            throw 'Snapshot is incomplete or modified; refusing restoration.'
        }
    }
}

function Restore-InstallationSnapshot {
    param([object]$Snapshot, [string]$InstallDir)
    Test-InstallationSnapshot -Snapshot $Snapshot -InstallDir $InstallDir
    if (Test-Path -LiteralPath $InstallDir) { @(Get-OrdinaryInstallFiles -Root $InstallDir) | Out-Null }
    foreach ($entry in $Snapshot.Files) {
        $source = Get-ContainedInstallPath (Join-Path $Snapshot.Backup 'files') $entry.Path
        $destination = Get-ContainedInstallPath $Snapshot.Root $entry.Path
        Copy-InstallBytes -Source $source -Destination $destination | Out-Null
    }
}

function Assert-InstallationDataPreserved {
    param([object]$Snapshot)
    foreach ($entry in $Snapshot.Files) {
        $isData = $entry.Path -match '^(config[\\/]|credentials[\\/]|covers[\\/]|apps\.json$|sunshine\.conf$|sunshine_state\.json$)'
        if ($isData) {
            $path = Get-ContainedInstallPath $Snapshot.Root $entry.Path
            if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path).Hash -ine $entry.SHA256) {
                throw 'Installation changed existing application data; restoration is required.'
            }
        }
    }
}
