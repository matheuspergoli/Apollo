$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try {
    Set-Location $PSScriptRoot
    foreach ($name in @('ApolloService', 'sunshinesvc')) {
        $service = Get-Service -Name $name -ErrorAction SilentlyContinue
        if ($service -and $service.Status -ne 'Stopped') {
            throw "O servico $name esta ativo. Termine o stream e pare o Apollo original manualmente em services.msc. Este launcher nao para servicos."
        }
    }
    if (Get-Process -Name sunshine -ErrorAction SilentlyContinue) {
        throw 'Outro sunshine.exe esta em execucao. Use apenas um host por vez.'
    }
    $ports = @(49984,49989,49990,49998,49999,50000,50010)
    $tcp = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in $ports })
    $udp = @(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object { $_.LocalPort -in $ports })
    if ($tcp.Count -gt 0 -or $udp.Count -gt 0) { throw 'Uma porta do teste esta ocupada. Host nao iniciado.' }
    Write-Host 'Apollo - pacote unico de teste'
    Write-Host 'Interface Apollo: https://localhost:49990'
    Write-Host 'Artemis: IP-DO-PC:49989. Use apenas um stream por vez.'
    Write-Host 'O host pode ajustar temporariamente preferencias NVIDIA e display como o Apollo normal.'
    Write-Host 'Nao ha driver novo nem PyroWave. Leia LEIA-ME.txt antes do teste.'
    if ((Read-Host 'Digite TESTAR para iniciar') -cne 'TESTAR') { throw 'Cancelado. Host nao iniciado.' }
    & .\sunshine.exe .\config\sunshine.conf
    if ($LASTEXITCODE -ne 0) { throw "O host encerrou com codigo $LASTEXITCODE. Consulte config\sunshine.log." }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    Write-Host 'Apos encerrar o teste, restaure o Apollo original manualmente em services.msc.'
    Read-Host 'Pressione Enter para fechar'
}
