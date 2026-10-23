import { z } from "zod"

const command = z.string().max(16384)
const path = z
	.string()
	.max(4096)
	.regex(/^[^\r\n]*$/)
const commands = z
	.array(
		z.strictObject({
			do: command.optional(),
			undo: command.optional(),
			elevated: z.boolean().optional()
		})
	)
	.max(256)

export const applicationOptionsSchema = z.strictObject({
	name: z
		.string()
		.min(1)
		.max(256)
		.regex(/^[^\r\n]+$/)
		.regex(/\S/)
		.describe(
			"Nome do aplicativo, em uma única linha. Deve ser preenchido antes de importar ou salvar."
		),
	cmd: command.describe(
		"Comando executado no host. Vazio transmite o desktop. Importar nunca executa o comando."
	),
	"working-dir": path.describe(
		"Diretório de trabalho no host; o arquivo JSON não transfere pastas."
	),
	output: path.describe("Caminho do arquivo de saída do processo no host."),
	"image-path": path.describe(
		"Caminho da capa no host. A imagem não é embutida ou baixada ao importar."
	),
	"exclude-global-prep-cmd": z
		.boolean()
		.describe("Ignorar os comandos globais de preparação."),
	"exclude-global-state-cmd": z.boolean().describe("Ignorar os comandos globais de estado."),
	elevated: z
		.boolean()
		.describe("Executar com privilégios elevados. Conceda somente se necessário."),
	"auto-detach": z.boolean().describe("Detectar e desanexar processos em segundo plano."),
	"wait-all": z.boolean().describe("Aguardar os processos do aplicativo."),
	"exit-timeout": z
		.number()
		.int()
		.min(0)
		.max(2147483647)
		.describe("Espera para encerramento em segundos, como número inteiro não negativo."),
	"scale-factor": z
		.number()
		.int()
		.min(20)
		.max(200)
		.describe("Escala de resolução em porcentagem inteira, de 20 a 200."),
	"prep-cmd": commands.describe(
		"Preparação e desfazer. Cada etapa contém do/undo como textos e elevated opcional como booleano."
	),
	"state-cmd": commands.describe(
		"Comandos de conexão/desconexão da sessão, no mesmo formato das etapas de preparação."
	),
	detached: z
		.array(command)
		.max(256)
		.describe(
			"Lista de comandos desanexados, na ordem de execução. Não são aguardados pelo host."
		),
	"use-app-identity": z.boolean().describe("Identidade de display por aplicativo."),
	"per-client-app-identity": z
		.boolean()
		.describe("Identidade de display por cliente e aplicativo."),
	"allow-client-commands": z
		.boolean()
		.describe("Permitir comandos enviados pelo cliente para este aplicativo."),
	"virtual-display": z
		.boolean()
		.describe("Usar display virtual; exige driver funcional e não instala drivers."),
	"terminate-on-pause": z
		.boolean()
		.describe("Encerrar o aplicativo quando a sessão for pausada."),
	gamepad: z
		.enum(["", "disabled", "auto", "x360", "ds4", "ds5", "switch", "xone"])
		.describe(
			"Controle emulado. Texto vazio usa a configuração global; alguns tipos dependem do sistema operacional."
		)
})

export const applicationFileSchema = z.strictObject({
	$schema: z.literal("./schema.json").optional(),
	format: z.literal("apollo-application"),
	version: z.literal(1),
	kind: z.enum(["template", "application"]),
	application: applicationOptionsSchema.partial()
})
