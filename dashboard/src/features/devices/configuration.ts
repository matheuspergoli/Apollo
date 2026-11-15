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
	const docs = `# Apollo — permissões de um dispositivo

${file.kind === "template" ? "Template conservador: listar e visualizar, sem entrada nem comandos." : "Exportação dos campos conhecidos do rascunho do editor, incluindo alterações não salvas."}

## Como importar

1. Extraia o ZIP e edite settings em dispositivo.json (UTF-8, até 256 KiB). Mantenha format="apollo-device-permissions", version=1 e kind. Consulte schema.json para a estrutura.
2. Use **Importar JSON de permissões** no editor de um dispositivo já pareado. Importe o JSON, não o ZIP.
3. Revise e confirme **Aplicar ao rascunho**. Só **Salvar dispositivo** grava no host. Importar não pareia, conecta, desconecta ou executa comandos.

Campos omitidos preservam o rascunho; campos presentes substituem o valor inteiro, inclusive listas vazias. Uma opção inválida rejeita o arquivo inteiro. Nome, UUID, certificados, estado de conexão e campos desconhecidos não transitam; os dados locais são preservados.

## Permissões e comandos

Zero em perm revoga todas as permissões; o template também pode reduzir permissões atuais. A máscara é decimal: JSON não aceita notação 0x. Apenas os bits documentados são aceitos. Salvar sem permissão de visualização pode desconectar o cliente. Booleanos usam true/false sem aspas.

do e undo aceitam comandos manuais de conexão e desconexão, não vínculos de scripts gerenciados. Se um comando chamar um arquivo no host, esse arquivo não será incluído na exportação. Scripts gerenciados e seus arquivos são transportados pela exportação de aplicativos.

O ZIP não é criptografado e pode conter comandos e caminhos privados. Revise antes de compartilhar. Confira comandos, elevação e dependências no destino: eles podem executar no host nos eventos de conexão/desconexão após salvar, quando permitidos.

## Bits de permissão

${permissions.map((permission) => `- ${permission.label}: ${permission.bit} (0x${permission.bit.toString(16)}). ${permission.help}`).join("\n")}

## Campos

${Object.entries(deviceSettingsSchema.shape)
	.map(([key, schema]) => `- ${key}: ${schema.description}`)
	.join("\n")}

Comandos: [{"cmd":"echo conectar","elevated":false}]. Cada lista aceita até 256 etapas e cada comando até 16384 caracteres. A importação valida também os valores mesclados ao editor.
`
	return configurationArchive("apollo-dispositivo", {
		"dispositivo.json": `${JSON.stringify(file, null, 2)}\n`,
		"LEIA-ME.md": docs,
		"schema.json": `${JSON.stringify(z.toJSONSchema(fileSchema), null, 2)}\n`
	})
}
