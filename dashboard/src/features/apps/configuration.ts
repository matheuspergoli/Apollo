import { z } from "zod"
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
	const merged = validateApp({ ...current, ...parsed.application })
	parseContract(
		applicationOptionsSchema,
		knownOptions(merged),
		"Revise o aplicativo resultante"
	)
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
	return `# Apollo — configuração de um aplicativo\n\nEste ZIP contém ${file.kind === "template" ? "um template com os padrões e um nome de exemplo" : "os valores conhecidos do rascunho deste editor, inclusive alterações ainda não salvas"}. Não é um atalho .art nem exportação global da biblioteca.\n\n## Como usar\n\n1. Extraia o ZIP. Edite aplicativo.json em UTF-8; limite de 512 KiB, profundidade máxima 20. Não importe o ZIP.\n2. Mantenha format="apollo-application", version=1 e kind. Opções ficam em application.\n3. No editor de um aplicativo novo ou existente, clique em Importar JSON de aplicativo. Confira os valores antes/depois e confirme Aplicar ao rascunho.\n4. Só Salvar aplicativo grava a biblioteca. Nada é executado, pareado ou reiniciado ao importar.\n\nCampos ausentes mantêm o rascunho atual. Campos presentes substituem o valor inteiro; listas vazias removem as etapas daquele campo. Ao criar, o nome precisa estar preenchido no JSON ou no editor. O template usa Meu aplicativo apenas como exemplo. Uma opção inválida rejeita o arquivo inteiro.\n\n## Identidade e privacidade\n\nUUID, IDs do host/aplicativo, estado de execução e campos desconhecidos não são exportados nem aceitos no JSON. Importar ao editar mantém o UUID local; criar gera identidade nova somente ao salvar. Os campos desconhecidos já existentes no aplicativo local não são apagados.\n\nO ZIP não é criptografado. Comandos/caminhos podem conter dados privados: revise antes de compartilhar. Arquivos de capas e executáveis não são transferidos. Caminhos apontam para o host. Revise elevação e comandos antes de salvar; comandos podem executar no host nos eventos configurados.\n\n## Exemplo de etapas\n\n\`\`\`json\n[{"do":"echo preparar","undo":"echo desfazer","elevated":false}]\n\`\`\`\n\nprep-cmd e state-cmd aceitam até 256 etapas; do/undo são textos opcionais de até 16384 caracteres e elevated é booleano opcional. detached é uma lista de até 256 textos de comando, não objetos. Booleanos usam true/false, sem aspas. Números são inteiros sem aspas. O schema.json permite conferir a estrutura em editores compatíveis; a validação do aplicativo resultante também considera os campos atuais do editor.\n\n## Campos\n\n${fields}\n`
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
