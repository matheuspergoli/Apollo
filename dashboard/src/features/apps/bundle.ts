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
	"execution-policy": z
		.literal("bypass")
		.optional()
		.describe(
			"Permitir execução somente no processo PowerShell filho; ausente herda a política."
		),
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
	$schema: z.literal("./schema.json").optional(),
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
			...(slot.reference["execution-policy"]
				? { "execution-policy": slot.reference["execution-policy"] }
				: {}),
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
		"LEIA-ME.md": `# Apollo — aplicativo com scripts

Exportação do editor, incluindo alterações não salvas e os bytes originais dos scripts em aplicativo.json. Exige Windows com suporte a scripts gerenciados.

## Como importar

1. Extraia o ZIP e importe aplicativo.json com **Importar JSON de aplicativo**. Limite: 2 MiB, UTF-8; profundidade máxima: 20.
2. Revise comandos, conteúdo dos scripts, argumentos, elevação e política de execução. Confirme **Aplicar ao rascunho**.
3. Use **Salvar aplicativo** e autorize os vínculos para gravar o aplicativo e criar cópias locais dos scripts.

O pacote usa format="apollo-application-bundle", version=1 e kind="application". schema.json descreve a estrutura. Uma opção inválida rejeita o arquivo inteiro. Campos presentes substituem o valor inteiro, inclusive listas; campos omitidos preservam o rascunho.

## O que é preservado

- Comandos manuais e scripts na inicialização, preparação/undo, eventos de sessão e comandos desanexados.
- Conteúdo e nome de cada arquivo, argumentos, ordem das etapas, elevação e diretório de trabalho configurado.
- Política por vínculo: "execution-policy": "bypass" vale só para o processo PowerShell filho, sem alterar a política permanente nem superar Política de Grupo. Ausente, herda a política.

Cada script aceita até 128 KiB em ASCII ou UTF-8 com BOM, sem bytes nulos. São até 32 vínculos por aplicativo e 16 argumentos por vínculo. Cada argumento é um texto literal de 1 a 1024 bytes, em uma linha, sem aspas duplas ou bytes nulos. O pacote transporta a revisão utilizada, não atualizações futuras do script de origem. Os arquivos estão em file.data, codificados em Base64; prefira o editor para adicionar ou alterar scripts.

## Identidade e dependências

O UUID do aplicativo editado é preservado; novos aplicativos e scripts recebem IDs locais. Os vínculos usam cópias independentes, sem sincronizar bibliotecas ou históricos.

Capas, executáveis, módulos PowerShell, credenciais e arquivos acessados pelos scripts não são transferidos. Caminhos e argumentos não são adaptados ao destino: confira essas dependências antes de executar.

O ZIP não é criptografado e inclui o conteúdo dos scripts. Revise dados privados antes de compartilhar e importe apenas conteúdo confiável. Scripts podem executar nos eventos configurados após salvar.
`
	})
}
