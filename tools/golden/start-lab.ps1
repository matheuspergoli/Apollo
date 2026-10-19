$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try {
    Set-Location $PSScriptRoot
    foreach ($name in @('ApolloService', 'sunshinesvc')) {
        $service = Get-Service -Name $name -ErrorAction SilentlyContinue
        if ($service -and $service.Status -ne 'Stopped') {
            throw "O servico $name esta ativo. Encerre o stream e pare o Apollo original manualmente em services.msc antes do teste. Este script nao para servicos."
        }
    }
    if (Get-Process -Name sunshine -ErrorAction SilentlyContinue) {
        throw 'Ja existe sunshine.exe em execucao. Feche o outro host antes de iniciar o laboratorio.'
    }
    $ports = @(49984,49989,49990,49998,49999,50000,50010)
    $tcp = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in $ports })
    $udp = @(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object { $_.LocalPort -in $ports })
    if ($tcp.Count -gt 0 -or $udp.Count -gt 0) {
        throw 'Uma porta do laboratorio esta ocupada. Nao foi iniciado nenhum processo.'
    }
    Write-Host 'Painel: https://localhost:49990'
    Write-Host 'Artemis na LAN: adicione IP-DO-PC:49989 como um NOVO host.'
    Write-Host 'Primeiro teste experimental: sem PyroWave ou driver novo.'
    Write-Host 'O host pode ajustar temporariamente preferencias NVIDIA e display, como o Apollo normal.'
    $answer = Read-Host 'Leu LEIA-ME.txt e aceita iniciar o teste? Digite TESTAR'
    if ($answer -cne 'TESTAR') { throw 'Teste cancelado; host nao iniciado.' }
    & .\sunshine.exe .\config\sunshine.conf
    if ($LASTEXITCODE -ne 0) { throw "O host encerrou com codigo $LASTEXITCODE. Consulte config\sunshine.log." }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    Write-Host 'Se parou o Apollo original, restaure-o manualmente em services.msc depois de fechar o laboratorio.'
    Read-Host 'Pressione Enter para fechar'
}
