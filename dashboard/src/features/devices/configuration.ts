import { z } from "zod"
import {
	configurationArchive,
	parseContract,
	readConfigurationJson
} from "@/lib/configuration-files"
import type { Document } from "@/lib/documents"
import { permissions, serializeDevice } from "./model"

export const deviceFileLimit = 256 * 1024
const allowedMask = permissions.reduce((mask, permission) => mask | permission.bit, 0)
const commands = z
	.array(z.strictObject({ cmd: z.string().max(16384), elevated: z.boolean().optional() }))
	.max(256)
export const deviceSettingsSchema = z.strictObject({
	perm: z
		.number()
		.int()
		.min(0)
		.max(allowedMask)
		.refine((value) => (value & ~allowedMask) === 0)
		.describe(
			"Máscara decimal dos bits documentados. Zero revoga todas; 50331648 permite listar e visualizar."
		),
	display_mode: z
		.string()
		.max(128)
		.regex(/^(?:|[1-9]\d*x[1-9]\d*x\d+(?:\.\d+)?)$/)
		.refine((value) => !value || Number(value.split("x")[2]) > 0)
		.describe("Vazio mantém o pedido do cliente. Exemplo: 1920x1080x120 ou 1920x1080x59.94."),
	allow_client_commands: z
		.boolean()
		.describe(
			"Permitir comandos de conexão/desconexão deste cliente. Revise comandos e elevação."
		),
	enable_legacy_ordering: z
		.boolean()
		.describe("Opção nativa de ordenação para o cliente; não muda o frontend."),
	always_use_virtual_display: z
		.boolean()
		.describe("Solicitar display virtual para este dispositivo. Não instala drivers."),
	do: commands.describe("Comandos ao conectar, com cmd texto e elevated booleano opcional."),
	undo: commands.describe("Comandos ao desconectar, no mesmo formato.")
})
const fileSchema = z.strictObject({
	$schema: z.literal("./schema.json").optional(),
	format: z.literal("apollo-device-permissions"),
	version: z.literal(1),
	kind: z.enum(["template", "device"]),
	settings: deviceSettingsSchema.partial()
})
export type DeviceFile = z.infer<typeof fileSchema>
const defaults = {
	perm: 0x03000000,
	display_mode: "",
	allow_client_commands: false,
	enable_legacy_ordering: true,
	always_use_virtual_display: false,
	do: [],
	undo: []
}

function knownSettings(current: Document) {
	for (const key of [
		"allow_client_commands",
		"enable_legacy_ordering",
		"always_use_virtual_display"
	] as const)
		parseContract(z.boolean(), current[key] ?? defaults[key], `Opção ${key} inválida`)
	parseContract(commands, current.do ?? [], "Comandos de conexão inválidos")
	parseContract(commands, current.undo ?? [], "Comandos de desconexão inválidos")
	const serialized = serializeDevice(current)
	return {
		...Object.fromEntries(
			Object.keys(defaults).map((key) => [key, serialized[key as keyof typeof serialized]])
		),
		perm: Number(current.perm)
	}
}
export function deviceTemplate(): DeviceFile {
	return {
		$schema: "./schema.json",
		format: "apollo-device-permissions",
		version: 1,
		kind: "template",
		settings: structuredClone(defaults)
	}
}
export function exportedDevice(current: Document): DeviceFile {
	const settings = parseContract(
		deviceSettingsSchema,
		knownSettings(current),
		"Permissões inválidas"
	)
	const result: DeviceFile = { ...deviceTemplate(), kind: "device", settings }
	readConfigurationJson(JSON.stringify(result), deviceFileLimit)
	return result
}
export function parseDeviceFile(raw: string, current: Document): DeviceFile {
	const parsed = parseContract(
		fileSchema,
		readConfigurationJson(raw, deviceFileLimit),
		"Arquivo de permissões inválido"
	)
	if (!Object.keys(parsed.settings).length)
		throw new Error("O arquivo não contém opções para importar.")
	parseContract(
		deviceSettingsSchema,
		knownSettings({ ...current, ...parsed.settings }),
		"Revise as permissões resultantes"
	)
	return parsed
}
export async function deviceArchive(file: DeviceFile) {
	readConfigurationJson(JSON.stringify(file), deviceFileLimit)
	parseContract(fileSchema, file, "Arquivo de permissões inválido")
	parseContract(deviceSettingsSchema, file.settings, "Permissões para exportação inválidas")
	const docs = `# Apollo — permissões de um dispositivo\n\nEste pacote contém ${file.kind === "template" ? "um template conservador: listar/visualizar, sem entrada nem comandos" : "os valores conhecidos do rascunho deste editor, inclusive alterações ainda não salvas"}.\n\nEdite settings em dispositivo.json (UTF-8, até 256 KiB). Mantenha format="apollo-device-permissions", version=1 e kind. Importe o JSON, não o ZIP, no editor de permissões de um dispositivo já pareado. Revise e confirme Aplicar ao rascunho; só Salvar dispositivo grava no host. O arquivo não cria vínculo, não pareia, não conecta nem desconecta.\n\nNome, UUID, certificados, estado de conexão e dados desconhecidos não transitam. A identidade e o nome locais permanecem intactos. Campos omitidos preservam o rascunho; listas presentes substituem o campo inteiro. Zero em perm revoga tudo. Booleanos usam true/false sem aspas. A máscara é decimal: JSON não aceita notação 0x. Apenas os bits abaixo são aceitos; o importador também valida o dispositivo resultante.\n\nO ZIP não é criptografado. Comandos podem conter caminhos/dados privados e executar no host ao conectar/desconectar após salvar. Importe apenas arquivos confiáveis e revise elevação.\n\n## Bits de permissão\n\n${permissions.map((permission) => `- ${permission.label}: ${permission.bit} (0x${permission.bit.toString(16)}). ${permission.help}`).join("\n")}\n\n## Campos\n\n${Object.entries(
		deviceSettingsSchema.shape
	)
		.map(([key, schema]) => `- ${key}: ${schema.description}`)
		.join(
			"\n"
		)}\n\nComandos: [{"cmd":"echo conectar","elevated":false}]. Cada lista aceita até 256 etapas e cada comando até 16384 caracteres. schema.json documenta a estrutura; validação em runtime também verifica os bits de permissão e os valores mesclados ao editor.\n`
	return configurationArchive("apollo-dispositivo", {
		"dispositivo.json": `${JSON.stringify(file, null, 2)}\n`,
		"LEIA-ME.md": docs,
		"schema.json": `${JSON.stringify(z.toJSONSchema(fileSchema), null, 2)}\n`
	})
}
