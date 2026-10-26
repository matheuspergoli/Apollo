# Aplicativos

Cadastre apenas caminhos e comandos conhecidos. Salvar uma entrada não inicia o
aplicativo; iniciar, parar e excluir exigem ações separadas. Excluir uma entrada
não desinstala o programa. Importações devem ser revisadas antes de salvar.

## Desktop

Crie uma entrada com nome `Desktop` e deixe o comando principal vazio para acessar
a área de trabalho. Configure o uso de display virtual e as permissões de acordo
com a sessão desejada.

## Executável Windows

Exemplo genérico, a ser adaptado à instalação local:

| Campo | Exemplo |
| --- | --- |
| Nome | Meu aplicativo |
| Comando | `"C:\Aplicativos\Meu aplicativo\programa.exe"` |
| Diretório de trabalho | `C:\Aplicativos\Meu aplicativo` |

Use aspas nos comandos com caminhos contendo espaços. Confira o contexto de usuário
do serviço e conceda somente as permissões necessárias, não acesso a todo o disco.

## Steam

Com o Steam instalado e seus protocolos registrados, um comando destacado pode
abrir `steam://open/bigpicture` ou `steam://rungameid/ID_DO_JOGO`. No Linux, a
invocação normalmente passa pelo executável `steam` da instalação local. Revise o
comando e o comportamento de encerramento; launchers podem trocar o processo inicial.

## Preparação e retorno

Esses comandos podem alterar o computador. Use-os apenas quando houver necessidade
concreta e teste uma forma de desfazer as alterações. Não copie scripts genéricos de
resolução, permissões, drivers ou encerramento de processos como requisito do Apollo.
Configurações de display dependem do backend; veja [configuração](configuration.md).
