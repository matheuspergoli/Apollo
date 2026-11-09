import { z } from "zod"
import {
	loadScript,
	scriptFileSchema,
	scriptSlots,
	validateApplicationScripts
} from "@/features/scripts/model"
import {
	configurationArchive,
	parseContract,
	readConfigurationJson
} from "@/lib/configuration-files"
import type { Document } from "@/lib/documents"
import { appDefaults, validateApp } from "./model"
import { applicationOptionsSchema } from "./schema"

export const applicationBundleLimit = 2 * 1024 * 1024
const pendingScript = z.strictObject({
	file: scriptFileSchema,
	arguments: z.array(z.string()).max(16).optional()
})
const step = z.strictObject({
	do: z.string().max(16384).optional(),
	undo: z.string().max(16384).optional(),
	elevated: z.boolean().optional(),
	"do-script": pendingScript.optional(),
	"undo-script": pendingScript.optional()
})
const options = applicationOptionsSchema.extend({
	"cmd-script": pendingScript.optional(),
	"prep-cmd": z.array(step).max(256),
	"state-cmd": z.array(step).max(256),
	detached: z
		.array(
			z.union([
				z.string().max(16384),
				z.strictObject({ cmd: z.literal("").optional(), "cmd-script": pendingScript })
			])
		)
		.max(256)
})
export const applicationBundleSchema = z.strictObject({
	$schema: z.string().optional(),
	format: z.literal("apollo-application-bundle"),
	version: z.literal(1),
	kind: z.literal("application"),
	application: options
})
export type ApplicationBundle = z.infer<typeof applicationBundleSchema>

export function hasApplicationScripts(application: Document) {
	return scriptSlots(application).some(
		({ owner, key }) => owner[`${key}-script`] !== undefined
	)
}

export async function exportedApplicationBundle(draft: Document): Promise<ApplicationBundle> {
	const application: Document = structuredClone(
		Object.fromEntries(
			[...Object.keys(appDefaults), "cmd-script"]
				.filter((key) => draft[key] !== undefined)
				.map((key) => [key, draft[key]])
		)
	)
	const scripts = validateApplicationScripts(application)
	// Read every pinned revision before producing a file. A missing revision fails
	// the whole export instead of creating an apparently complete archive.
	const files = await Promise.all(scripts.map(({ reference }) => loadScript(reference)))
	for (const [index, slot] of scripts.entries())
		slot.owner[`${slot.key}-script`] = {
			file: files[index],
			arguments: slot.reference.arguments || []
		}
	const bundle = applicationBundleSchema.parse({
		$schema: "./schema.json",
		format: "apollo-application-bundle",
		version: 1,
		kind: "application",
		application: validateApp(application)
	})
	readConfigurationJson(JSON.stringify(bundle), applicationBundleLimit)
	return bundle
}

export function parseApplicationBundle(raw: string): ApplicationBundle {
	const bundle = parseContract(
		applicationBundleSchema,
		readConfigurationJson(raw, applicationBundleLimit),
		"Pacote de aplicativo inválido"
	)
	validateApp(bundle.application)
	return bundle
}

export async function applicationBundleArchive(bundle: ApplicationBundle) {
	parseApplicationBundle(JSON.stringify(bundle))
	return configurationArchive("apollo-aplicativo", {
		"aplicativo.json": `${JSON.stringify(bundle, null, 2)}\n`,
		"schema.json": `${JSON.stringify(z.toJSONSchema(applicationBundleSchema), null, 2)}\n`,
		"LEIA-ME.md":
			"# Aplicativo com scripts\n\nImporte aplicativo.json no editor de Aplicativos. Os scripts estão incluídos com seus bytes originais; capas, executáveis, módulos e caminhos externos não são transferidos. Revise conteúdo, argumentos e privilégios antes de salvar. Importar apenas altera o rascunho; salvar cria cópias locais dos scripts, sem executá-los. A identidade local do aplicativo é preservada. O pacote não é criptografado: revise os scripts antes de compartilhar.\n"
	})
}
