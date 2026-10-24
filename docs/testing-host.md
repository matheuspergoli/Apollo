# Regressões manuais no host e no cliente

Checklist para futuras alterações e atualização de versões. Não é uma lista de
pendências da 1.0: o aceite real do usuário está registrado no guia da release.
Testes automatizados com API simulada e ensaios de dispositivo têm escopos diferentes.

## Preparação isolada

1. Faça backup privado e extraia o ZIP em uma pasta nova, nunca sobre os dados existentes.
2. Salve o progresso dos jogos. Encerre o host antigo pelo seu procedimento habitual
   antes de iniciar outro host: portas diferentes não isolam GPU e displays.
3. Decida explicitamente se usará uma cópia privada dos dados existentes ou uma
   instalação limpa. Não sobrescreva conta, chaves ou pareamentos para fazer um teste.
4. Inicie o executável manualmente. Para validar apenas o ZIP, não execute o instalador,
   scripts de serviço, firewall ou drivers. A instalação convencional é um ensaio separado.

No Windows, os dados deste host ficam em `config` ao lado do executável. Usar uma
pasta nova separa conta, certificados, biblioteca e pareamentos dos originais.
Não publique essa pasta após o teste: ela passará a conter dados privados.

Abra o endereço HTTPS informado pelo host e confira qual instalação está acessando.
O painel usa porta base + 1. Para parear uma instalação limpa, use no Artemis o IP
do PC e a porta base escolhida; não substitua o cadastro do host habitual por engano.

### Atenção ao importar templates

Os templates contêm **padrões**, não os valores atuais. No template de rede, a
porta base padrão é 47989 e o painel correspondente é 47990. Para manter o teste
em 50990, remova `port` do JSON ou use `50989`. Importar/aplicar só muda o rascunho;
é preciso revisar e salvar. Valores iguais aos padrões podem ser omitidos do
arquivo pelo host; isso não significa perda de gravação.

Da mesma forma, importar os padrões gerais pode reativar bandeja ou descoberta.
Remova do JSON os campos que deseja preservar. Se mudar a porta, após reiniciar
use o novo endereço informado pelo painel. Uma conexão encerrada durante o
reinício não confirma sucesso nem falha e não deve provocar repetição automática.

## Checklist de aceitação

- [ ] Todas as telas abrem e recarregam: visão geral, dispositivos, aplicativos,
  configurações, acesso/senha e diagnóstico; sem painel antigo ou seletor de idioma.
- [ ] No dispositivo cliente, menus, campos, diálogos e temas claro/escuro permanecem utilizáveis.
- [ ] Nos editores de dispositivo/aplicativo, a barra de salvar acompanha as bordas
  dos cartões durante a rolagem. No desktop, confira também a navegação recolhida.
- [ ] Pareamento por PIN funciona; confira nome e permissões antes de transmitir.
- [ ] Código temporário/QR funciona; após expirar, não permite reutilizar o link.
- [ ] Aplicativo de teste pode ser criado, editado, ordenado, iniciado e encerrado.
  Use apenas comandos conhecidos. Excluir a entrada não deve desinstalar o jogo.
- [ ] No editor, o ZIP de aplicativo contém JSON/guia/schema. Importar e cancelar
  não modifica nada; aplicar mantém o UUID ao editar e só grava com Salvar aplicativo.
  Criar por importação gera outra identidade. Exportar inclui o rascunho e pede confirmação.
- [ ] Buscar `saida` e `saída` retorna as mesmas opções; múltiplos termos e limpar/
  Escape funcionam. Switches habilitados indicam clique; os desabilitados continuam bloqueados.
- [ ] Configuração pode ser revisada e salva, preservando outros valores. Salvar não
  reinicia o host. Recarregue e confira a persistência. Teste mudanças inofensivas
  primeiro, como nome do host; não altere caminhos de credenciais/chaves.
- [ ] A exportação global de valores salvos exige confirmação e não inclui alterações
  ainda no rascunho. O template completo usa padrões e é identificado separadamente.
- [ ] A importação global permite revisar várias seções, cancelar sem mudar nada e
  aplicar ao rascunho sem gravar. A gravação posterior preserva campos omitidos e
  opções desconhecidas já existentes. JSON com uma seção inválida é rejeitado inteiro.
- [ ] Stream no Artemis usa o display correto; áudio, teclado/controle, resolução,
  FPS e HDR desejados funcionam. Verifique as estatísticas no Artemis, não no painel.
- [ ] Desconectar mantém o pareamento; desvincular exige confirmação e impede nova
  conexão até parear novamente.
- [ ] Logs podem ser filtrados e baixados. Revise dados pessoais antes de compartilhar.
- [ ] Troca de senha exige o acesso atual, invalida a sessão e permite novo login.
- [ ] Envie uma capa PNG e salve o aplicativo. O caminho
  em config/covers é uma cópia no host; para usar o original, informe seu caminho
  sem aspas. Cópias corrompidas por versões antigas precisam ser reenviadas.
- [ ] Inicie um aplicativo no host e encerre pelo Artemis: ao retornar ao painel,
  confira a atualização automática, sem precisar enviar outro Encerrar.
- [ ] Abra o link/QR do aplicativo no dispositivo com Artemis instalado e o host
  já pareado. No navegador do PC sem cliente associado, não espere abertura no celular.
- [ ] Exporte/importe um perfil de permissões em um dispositivo já pareado, cancele
  antes de aplicar e confira que nome/identidade não foram trocados. Salve só após revisar.
- [ ] Confira a exportação dos valores salvos de uma seção e o atalho global de
  reinício; ele deve ficar bloqueado enquanto houver rascunhos ou operações pendentes.
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

Para cortes de áudio, anote o horário, se a imagem também travou e se o áudio local
do PC cortou. O roteiro de investigação está em `docs/audio-dropout-investigation.md`.
Não é necessário mudar drivers, prioridade ou buffers para testar a nova interface.
