# 0001 — Host-first, evolução por evidência e efeitos limitados

**Estado:** aceita para as restrições e o processo de decisão. Os modules futuros
e seus desenhos de interface continuam em investigação no [roadmap](../roadmap.md).

## Contexto

O Apollo 1.0.2 fornece uma referência publicada, com interface aprovada, contratos
e distribuição verificados. O estudo “Golden” propõe observabilidade, recuperação
e performance. Adotar todos os desenhos como implementação imediata criaria novas
responsabilidades antes de medir as limitações dos caminhos herdados.

## Decisão

- Priorizar o host Windows sem exigir alterações no Artemis ou protocolo exclusivo.
  Windows 11/NVIDIA é um recorte inicial de medição, não especialização por dispositivo
  no código. Preservar os caminhos AMD/Intel/Linux existentes; não reintroduzir macOS.
- Preservar branding e dashboard. Uma proposta de painel não autoriza mudança visual.
- Investigar e reutilizar sinais existentes antes de introduzir telemetria. Medir
  apenas o que o host observa; não anunciar latência até os pixels do cliente.
- Alterações externas têm consentimento, escopo e ownership. Recuperação incerta
  termina com diagnóstico e controle explícito, não insistência indefinida.
- Começar com regressões de comportamento e mudanças pequenas. Uma caixa de diagrama
  não obriga criar um module, adapter, processo ou flag. Exigir depth e leverage na
  interface e locality no conhecimento; evitar um coordenador que só repassa chamadas.
- Experimentos de captura e performance têm alternativa estável e critérios
  anteriores à promoção. Correções de segurança não viram toggles opcionais.
- Separar CI, testes de integração e benchmark de hardware. Não adaptar drivers ou
  o produto para um runner inadequado. Não operar o host ativo como consequência
  implícita de uma análise, teste ou coleta de diagnóstico.
- Fazer integração upstream seletiva, com fonte, licença e regressão verificadas.
  Não criar driver próprio nem importar tecnologias que exijam outro cliente no
  escopo ativo. Substituições de drivers seguem propostas próprias.

## Consequências

Inventário e baseline precedem otimizações especulativas; bugs concretos de segurança
ou recuperação não ficam bloqueados por esse sequenciamento. Nenhum ganho percentual
universal, prazo de versão ou cobertura total de hardware foi aprovado.

Diagramas e nomes do estudo representam hipóteses de organização. A
[arquitetura](../architecture.md) mapeia a implementação atual e as perguntas abertas.
Resultados devem atualizar o roadmap e os PRs, sem relatórios pessoais no repositório.

Revisitar esta decisão exige demonstrar qual restrição impede um caso concreto e
avaliar compatibilidade, risco e manutenção. Não revogá-la por preferência por um
upstream ou para tornar um benchmark isolado mais favorável.
