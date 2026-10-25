function Get-SudoVdaInstallDecision {
    param([object[]]$Devices, [version]$BundledVersion)

    if ($Devices.Count -eq 0) { return 'Install' }
    if ($Devices.Count -ne 1) { throw 'Multiple SudoVDA adapters found; refusing automatic replacement.' }
    $device = $Devices[0]
    if ($device.ProblemCode -eq 22) { throw 'SudoVDA is disabled. Enable it explicitly before installation.' }
    if ($device.ProblemCode -ne 0) { throw "SudoVDA has PnP problem $($device.ProblemCode); manual recovery is required." }
    if (-not $device.DriverVersion) { throw 'Cannot establish the installed SudoVDA version.' }
    if ([version]$device.DriverVersion -ge $BundledVersion) { return 'Keep' }
    return 'Update'
}
