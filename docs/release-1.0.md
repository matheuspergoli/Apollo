# Fechamento da versão 1.0

## Autenticação

A duração nativa da sessão é de 15 dias. Um HTTP 401 sozinho não comprova
expiração. Reiniciar o processo, trocar credenciais ou fazer outro login invalida
a sessão anterior. O backend mantém uma sessão administrativa por processo.

O cookie antigo `auth` era compartilhado entre portas do mesmo hostname, permitindo
interferência entre instalações locais. A sessão agora usa `apollo_auth_<porta>`,
com Secure, HttpOnly, SameSite=Strict e validade alinhada aos 15 dias do backend.
Será necessário entrar novamente ao atualizar; configurações e pareamento não mudam.
Esse defeito foi identificado no código, mas ainda não é prova da causa do relato
específico. Os logs agora distinguem `session_missing`, `session_expired`,
`cookie_missing` e `session_mismatch`, sem registrar tokens ou senhas.

O ensaio Windows isolado verifica cookies de outras instalações, nomes exatos,
rejeição sem autorização, recuperação sem repetir comandos e o botão de reinício
real logo após autenticação. Só executa no runner deste fork; nunca no host ativo.

## Consolidação

A branch de destino é `main`. As branches de migração e correções de relógio
já incluem seus trabalhos na árvore React atual. A branch `permission-system`, de
2024 e com histórico separado, não deve reintroduzir a antiga UI: seu histórico
será preservado por merge de ancestralidade, mantendo a árvore atual. Isso não
equivale a aplicar alterações obsoletas sobre a implementação validada.

Antes de excluir branches remotas, preservar referências em bundle local, publicar
`main`, confirmar o histórico e alterar a branch padrão do fork. Não alterar upstream.

## Critérios de liberação

- [ ] Biome, TypeScript, unitários, build e regressões Chromium do commit publicado.
- [ ] Compilação e ensaio HTTPS Windows, incluindo reinício autenticado real.
- [ ] Auditoria do ZIP exato e identificação do commit de origem.
- [ ] Revisão visual nos temas claro/escuro e larguras móvel/tablet/desktop.
- [ ] Conferência no Windows/Artemis do usuário: login seguido de reinício,
      PNG, pareamento preservado, sessão de jogo e retorno do display.
- [ ] Tag `v1.0.0` somente após concluir os critérios; sem promessa de perfeição
      ou ganhos de desempenho não medidos.

Os testes de navegador com API simulada não substituem os testes de dispositivo.
Não apagar documentação histórica ou testes só para retirar a palavra “teste”.
A interface de uso não deve conter branding de laboratório ou migração.
