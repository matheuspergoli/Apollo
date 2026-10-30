# Glossário do domínio

- **Payload público:** arquivos de programa distribuídos pelo Apollo, sem o
  diretório `config`, estado privado conhecido ou caminhos inseguros. O diretório
  de staging e o ZIP representam o mesmo conteúdo, não políticas distintas.
- **Manifesto de instalação:** inventário dos caminhos relativos e hashes dos
  arquivos de programa. Exclui somente o próprio manifesto na raiz; não substitui
  a auditoria independente dos bytes do pacote.
- **Contrato de runtime:** lista versionada dos arquivos obrigatórios, arquitetura
  dos binários e hashes de fornecedores exigidos pela distribuição Windows.
