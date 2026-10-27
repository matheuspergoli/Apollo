# Glossário do domínio

- **Payload público:** arquivos de programa distribuídos pelo Apollo, sem o
  diretório `config`, estado privado conhecido ou caminhos inseguros. O diretório
  de staging e o ZIP representam o mesmo conteúdo, não políticas distintas.
- **Manifesto de instalação:** inventário dos caminhos relativos e hashes dos
  arquivos de programa. Exclui somente o próprio manifesto na raiz; não substitui
  a auditoria independente dos bytes do pacote.
- **Contrato de runtime:** lista versionada dos arquivos obrigatórios, arquitetura
  dos binários e hashes de fornecedores exigidos pela distribuição Windows.
- **Sessão de transmissão:** relação negociada entre host e cliente. Não equivale
  ao processo do host nem ao aplicativo lançado; recursos compartilhados precisam
  ser identificados antes de atribuir métricas ou efeitos a uma única sessão.
- **Frame capturado / imagem reutilizável / frame codificado:** conceitos distintos.
  Uma imagem pode ser reutilizada e uma captura pode ser descartada ou repetida;
  seu identificador não deve ser tratado automaticamente como ID dos outros.
- **Idade do frame:** diferença entre um timestamp de origem definido e um ponto
  observado no host, na mesma base temporal. Exige origem e ajustes documentados;
  não significa latência de apresentação no cliente.
- **Ownership de uma alteração:** evidência de que o Apollo pode modificar ou
  restaurar aquele recurso naquele momento. Um snapshot antigo, um nome de display
  ou uma geração local, isoladamente, não prova autoria de mudanças externas.
- **Baseline:** configuração e procedimento de referência reproduzíveis, com
  variação medida. Não é um preset obrigatório ou um perfil pessoal distribuído.
