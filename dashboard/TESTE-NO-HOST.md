# Validação que depende do seu Windows e do S25+

Este é um candidato com a interface React inteira, não uma prévia paralela.
A versão estável anterior e seus arquivos privados devem permanecer intactos.
O pacote é de teste: não execute instaladores de serviço ou drivers incluídos nele.

## Preparação isolada

1. Extraia o candidato em uma pasta nova, nunca sobre a instalação atual.
2. Salve o progresso dos jogos. Encerre o host antigo pelo seu procedimento habitual
   antes de iniciar o candidato: portas diferentes não isolam GPU e displays.
3. Abra PowerShell na pasta extraída `Apollo`, onde está `sunshine.exe`.
4. Crie **somente o arquivo novo abaixo**, sem copiar conta, chaves ou pareamentos:

```powershell
New-Item -ItemType Directory -Path .\config -Force | Out-Null
if (Test-Path .\config\teste-react.conf) { throw 'O arquivo de teste já existe. Não sobrescreva seus ajustes.' }
$text = "port = 50989`nsunshine_name = Apollo React Teste`nenable_discovery = disabled`nupnp = disabled`nsystem_tray = disabled`n"
[IO.File]::WriteAllText((Join-Path $PWD 'config\teste-react.conf'), $text, [Text.UTF8Encoding]::new($false))
.\sunshine.exe .\config\teste-react.conf
```

No Windows, os dados deste host ficam em `config` ao lado do executável. Usar uma
pasta nova separa conta, certificados, biblioteca e pareamentos dos originais.
Não publique essa pasta após o teste: ela passará a conter dados privados.

Abra `https://localhost:50990`, confira que é o host de teste e crie uma conta
temporária. O certificado local pode exigir confirmação no navegador.
No Artemis, adicione manualmente o IP do PC com a porta base `50989`.
Não altere o cadastro do host estável para apontar para outro executável.

## Checklist de aceitação

- [ ] Todas as telas abrem e recarregam: visão geral, dispositivos, aplicativos,
  configurações, acesso/senha e diagnóstico; sem painel antigo ou seletor de idioma.
- [ ] No S25+, menus, campos, diálogos e temas claro/escuro permanecem utilizáveis.
- [ ] Pareamento por PIN funciona; confira nome e permissões antes de transmitir.
- [ ] Código temporário/QR funciona; após expirar, não permite reutilizar o link.
- [ ] Aplicativo de teste pode ser criado, editado, ordenado, iniciado e encerrado.
  Use apenas comandos conhecidos. Excluir a entrada não deve desinstalar o jogo.
- [ ] Configuração pode ser revisada e salva, preservando outros valores. Salvar não
  reinicia o host. Recarregue e confira a persistência. Teste mudanças inofensivas
  primeiro, como nome do host; não altere caminhos de credenciais/chaves.
- [ ] Stream no Artemis usa o display correto; áudio, teclado/controle, resolução,
  FPS e HDR desejados funcionam. Verifique as estatísticas no Artemis, não no painel.
- [ ] Desconectar mantém o pareamento; desvincular exige confirmação e impede nova
  conexão até parear novamente.
- [ ] Logs podem ser filtrados e baixados. Revise dados pessoais antes de compartilhar.
- [ ] Troca de senha exige o acesso atual, invalida a sessão e permite novo login.
- [ ] Ao terminar, encerre o candidato e retorne ao host estável; confirme que conta,
  biblioteca e pareamentos originais continuam funcionando.

Não é necessário provocar reinícios ou restaurar displays durante um jogo para
aceitar a interface. Essas ações são destrutivas e só devem ser testadas com acesso
local e disposição para recuperar o host manualmente.

## O que informar

Informe commit do pacote, etapa, resultado esperado e resultado observado. Uma
captura da tela e trecho de log revisado ajudam. Nunca envie senhas, cookies,
certificados privados ou a pasta `config` completa. Para qualidade de streaming,
registre codec/resolução/FPS/HDR e estatísticas do Artemis; a validação automatizada
não mede latência física, HDR ou estabilidade do driver no seu hardware.
