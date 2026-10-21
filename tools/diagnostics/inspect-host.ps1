$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$tools = foreach ($name in @('cmake', 'ninja', 'cl', 'clang-cl')) {
    [pscustomobject]@{ Name = $name; OnPath = [bool](Get-Command $name -ErrorAction SilentlyContinue) }
}
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; DriverVersion = $_.DriverVersion }
})
$services = @(Get-Service -Name ApolloService,sunshinesvc -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; Status = $_.Status.ToString() }
})
$adapters = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Display'" | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; Status = $_.Status; ProblemCode = $_.ConfigManagerErrorCode }
})

[pscustomobject]@{
    Schema = 1
    CollectedAtUtc = [DateTime]::UtcNow.ToString('o')
    Scope = 'Read-only host inventory; no benchmark or effective-stream validation'
    WindowsVersion = [Environment]::OSVersion.Version.ToString()
    QpcFrequency = [System.Diagnostics.Stopwatch]::Frequency
    QpcHighResolution = [System.Diagnostics.Stopwatch]::IsHighResolution
    Gpus = $gpus
    DisplayAdapters = $adapters
    Services = $services
    ToolchainOnPath = @($tools)
} | ConvertTo-Json -Depth 5
