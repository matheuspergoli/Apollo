import { z } from "zod"
import { scriptSlots } from "@/features/scripts/model"
import {
	configurationArchive,
	parseContract,
	readConfigurationJson
} from "@/lib/configuration-files"
import type { Document } from "@/lib/documents"
import { appDefaults, validateApp } from "./model"
import { applicationFileSchema, applicationOptionsSchema } from "./schema"

export const applicationFileLimit = 512 * 1024
export type ApplicationFile = z.infer<typeof applicationFileSchema>

function knownOptions(value: Document) {
	return Object.fromEntries(Object.keys(appDefaults).map((key) => [key, value[key]]))
}

export function applicationTemplate(): ApplicationFile {
	return {
		$schema: "./schema.json",
		format: "apollo-application",
		version: 1,
		kind: "template",
		application: { ...structuredClone(appDefaults), name: "Meu aplicativo" }
	}
}

export function exportedApplication(draft: Document): ApplicationFile {
	if (scriptSlots(draft).some(({ owner, key }) => owner[`${key}-script`] !== undefined))
		throw new Error(
			"Este formato não inclui scripts gerenciados. A exportação foi interrompida para preservar os vínculos."
		)
	const application = parseContract(
		applicationOptionsSchema,
		knownOptions(validateApp(draft)),
		"Aplicativo inválido"
	)
	const file: ApplicationFile = {
		$schema: "./schema.json",
		format: "apollo-application",
		version: 1,
		kind: "application",
		application
	}
	readConfigurationJson(JSON.stringify(file), applicationFileLimit)
	return file
}

export function parseApplicationFile(raw: string, current: Document): ApplicationFile {
	const parsed = parseContract(
		applicationFileSchema,
		readConfigurationJson(raw, applicationFileLimit),
		"Arquivo de aplicativo inválido"
	)
	if (!Object.keys(parsed.application).length)
		throw new Error("O arquivo não contém opções de aplicativo para importar.")
	const candidate: Document = { ...current, ...parsed.application }
	if (Object.hasOwn(parsed.application, "cmd")) delete candidate["cmd-script"]
	const merged = validateApp(candidate)
	// Validate the remaining legacy options without treating existing, separately
	// validated script bindings as foreign fields. This view is never persisted
	// or exported; partial imports must leave untouched bindings in the draft.
	const legacyOptions = structuredClone(knownOptions(merged))
	for (const { owner, key } of scriptSlots(legacyOptions)) delete owner[`${key}-script`]
	legacyOptions.detached = (legacyOptions.detached as (string | Document)[]).map((command) =>
		typeof command === "string" ? command : (command.cmd ?? "")
	)
	parseContract(applicationOptionsSchema, legacyOptions, "Revise o aplicativo resultante")
	return parsed
}

export function applicationDocumentation(file: ApplicationFile) {
	const schema = z.toJSONSchema(applicationOptionsSchema)
	const properties = schema.properties as Record<string, Record<string, unknown>>
	const fields = Object.entries(properties)
		.map(
			([key, field]) =>
				`### \`${key}\`\n\n${field.description || "Opção do aplicativo."}\n\n- Padrão: \`${JSON.stringify(appDefaults[key])}\`\n- Tipo: \`${JSON.stringify(field.type || "estrutura; consulte schema.json")}\`\n${field.enum ? `- Opções: ${JSON.stringify(field.enum)}\n` : ""}${field.minimum !== undefined ? `- Mínimo: ${field.minimum}\n` : ""}${field.maximum !== undefined ? `- Máximo: ${field.maximum}\n` : ""}${field.maxLength ? `- Máximo de caracteres: ${field.maxLength}\n` : ""}${field.maxItems ? `- Máximo de itens: ${field.maxItems}\n` : ""}`
		)
		.join("\n")
	return `# Apollo — configuração de um aplicativo

${file.kind === "template" ? "Template básico com padrões e o nome de exemplo Meu aplicativo. Preencha os comandos manuais e caminhos em application." : "Exportação dos campos conhecidos do rascunho do editor, incluindo alterações não salvas."}

## Como importar

1. Extraia o ZIP e edite aplicativo.json em UTF-8, sem comentários. Limite: 512 KiB; profundidade máxima: 20.
2. Mantenha format="apollo-application", version=1 e kind. Consulte schema.json para a estrutura.
3. Use **Importar JSON de aplicativo** no editor de um aplicativo novo ou existente. Importe o JSON, não o ZIP.
4. Revise, confirme **Aplicar ao rascunho** e use **Salvar aplicativo**.

Campos omitidos preservam o rascunho. Campos presentes substituem o valor inteiro, inclusive listas vazias. Uma opção inválida rejeita o arquivo inteiro. O nome precisa estar preenchido no JSON ou no editor.

## Scripts gerenciados

Este formato aceita comandos manuais. Para incluir scripts, use **Exportar aplicativo do editor**: o pacote apollo-application-bundle preserva arquivos, argumentos e políticas por vínculo e usa o mesmo botão de importação.

cmd substitui também o vínculo de script da inicialização; prep-cmd, state-cmd e detached substituem as listas inteiras.

## Identidade, arquivos e segurança

O arquivo contém um aplicativo, sem UUID, estado de execução ou campos desconhecidos. Ao editar, os dados locais são preservados; ao criar, o host gera um UUID.

O ZIP não é criptografado e pode conter comandos e caminhos privados. Capas, executáveis e outros arquivos externos não são transferidos. Revise comandos, caminhos e elevação: podem executar ações no host nos eventos configurados após salvar.

## Comandos manuais

\`\`\`json
[{"do":"echo preparar","undo":"echo desfazer","elevated":false}]
\`\`\`

prep-cmd e state-cmd aceitam até 256 etapas; do/undo são textos opcionais de até 16384 caracteres. detached aceita até 256 textos de comando. Consulte os tipos e limites abaixo.

## Campos

${fields}
`
}

export async function applicationArchive(file: ApplicationFile) {
	readConfigurationJson(JSON.stringify(file), applicationFileLimit)
	parseContract(applicationFileSchema, file, "Arquivo de aplicativo inválido")
	parseContract(
		applicationOptionsSchema,
		file.application,
		"Aplicativo para exportação inválido"
	)
	return configurationArchive("apollo-aplicativo", {
		"aplicativo.json": `${JSON.stringify(file, null, 2)}\n`,
		"LEIA-ME.md": applicationDocumentation(file),
		"schema.json": `${JSON.stringify(z.toJSONSchema(applicationFileSchema), null, 2)}\n`
	})
}
