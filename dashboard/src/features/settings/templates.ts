import {
	configurationArchive,
	parseContract,
	readConfigurationJson
} from "@/lib/configuration-files"
import { type Document, object } from "@/lib/documents"
import { sectionFileSchema } from "./file-contracts"
import { draftFrom, type SettingSection, serializeSettings } from "./model"

export const templateLimit = 256 * 1024
const format = "apollo-settings-section"

export function sectionTemplate(section: SettingSection) {
	return {
		format,
		version: 1,
		section: section.id,
		settings: Object.fromEntries(
			section.fields.map((field) => [field.key, structuredClone(field.defaultValue)])
		)
	}
}

export function sectionDocumentation(
	section: SettingSection,
	mode: "section" | "reference" | "saved" = "section"
) {
	const blocks = section.fields.map((field) => {
		const type = Array.isArray(field.defaultValue)
			? "lista de objetos"
			: typeof field.defaultValue === "object"
				? "objeto"
				: typeof field.defaultValue === "number"
					? "número JSON"
					: "texto JSON"
		const details = [
			`### ${field.label} — \`${field.key}\``,
			field.description ||
				"Opção nativa do Apollo; confira os efeitos no host antes de aplicar.",
			`- Tipo: ${type}.\n- Padrão: \`${JSON.stringify(field.defaultValue)}\`.`,
			...(field.min !== undefined ? [`- Mínimo: ${field.min}.`] : []),
			...(field.max !== undefined ? [`- Máximo: ${field.max}.`] : []),
			...(field.step !== undefined ? [`- Passo do controle: ${field.step}.`] : []),
			...(["enabled", "disabled"].includes(String(field.defaultValue)) && !field.options
				? ['- Valores aceitos: `"enabled"` (ativado) ou `"disabled"` (desativado).']
				: []),
			...(field.options
				? [
						"Valores aceitos:",
						...field.options.map(
							(option) =>
								`- \`${JSON.stringify(typeof field.defaultValue === "number" ? Number(option.value) : option.value)}\`: ${option.label}.`
						)
					]
				: [])
		]
		return details.join("\n\n")
	})
	if (mode === "reference")
		return `# Apollo — ${section.title}\n\nReferência dos campos desta seção no JSON global, em \`sections.${section.id}\`. Os valores padrão abaixo são documentação; os valores exportados estão em \`configuracao.json\`. Leia o LEIA-ME da raiz antes de importar.\n\n${blocks.join("\n\n")}\n`
	return `# Apollo — ${section.title}${mode === "saved" ? ": valores salvos" : ""}

${mode === "saved" ? "Exportação dos valores salvos desta seção, com padrões para campos ausentes e sem o rascunho." : "Template com os padrões desta seção."}

## Como importar

1. Extraia o ZIP e edite settings em configuracao.json (UTF-8, até 256 KiB, sem comentários).
2. Mantenha format="${format}", version=1 e section="${section.id}". Importe o JSON na seção **${section.title}**, não o ZIP.
3. Confirme **Aplicar ao rascunho** e use **Revisar e salvar**.

Campos omitidos preservam o rascunho. Campos presentes substituem o valor inteiro, inclusive listas e objetos; listas vazias removem comandos ou regras. Chaves de outra seção, versões desconhecidas e valores inválidos rejeitam o arquivo inteiro.

Números usam ponto decimal, sem aspas. Opções booleanas do host usam os textos documentados, como "enabled" e "disabled". Os padrões abaixo são referência; podem diferir dos valores exportados.

## Comandos e arquivos

Estas configurações aceitam comandos manuais. Para transportar scripts gerenciados, use **Exportar aplicativo do editor**, em Aplicativos.

Revise comandos e elevação: podem executar ações nos eventos configurados após salvar. Caminhos não transferem arquivos, certificados ou credenciais. O ZIP não é criptografado e pode conter dados privados; revise antes de compartilhar.

Mudanças de rede podem impedir acesso: a porta do painel é a base + 1. Adapte caminhos e opções à plataforma de destino.

## Estruturas e exemplos

Use somente nos campos correspondentes desta seção:

- Preparação/estado: [{"do":"echo iniciar","undo":"echo desfazer","elevated":false}].
- Servidor: [{"name":"Exemplo","cmd":"echo exemplo","elevated":false}].
- Display: {"mixed":[{"requested_resolution":"1920x1080","requested_fps":"60","final_resolution":"1920x1080","final_refresh_rate":"60"}],"resolution_only":[],"refresh_rate_only":[]}.

## Campos desta seção

${blocks.join("\n\n")}
`
}

export function parseSectionTemplate(raw: string, section: SettingSection): Document {
	const root = parseContract(
		sectionFileSchema,
		readConfigurationJson(raw, templateLimit),
		"Template da seção inválido"
	)
	if (root.section !== section.id)
		throw new Error(`Este template não pertence à seção ${section.title}.`)
	return validateSectionSettings(root.settings, section)
}

export function validateSectionSettings(value: unknown, section: SettingSection): Document {
	const settings = object(value)
	if (!Object.keys(settings).length)
		throw new Error("O template não contém opções para importar.")
	for (const [key, value] of Object.entries(settings)) {
		const field = section.fields.find((field) => field.key === key)
		if (!field) throw new Error(`A opção ${key} não pertence a esta seção.`)
		if (
			value === null ||
			typeof value !== typeof field.defaultValue ||
			Array.isArray(value) !== Array.isArray(field.defaultValue)
		)
			throw new Error(`${field.label}: tipo de valor incorreto. Consulte o template.`)
		if (field.options && !field.options.some((option) => option.value === String(value)))
			throw new Error(`${field.label}: valor fora das opções permitidas.`)
		if (
			["enabled", "disabled"].includes(String(field.defaultValue)) &&
			!field.options &&
			!["enabled", "disabled"].includes(String(value))
		)
			throw new Error(`${field.label}: use enabled ou disabled.`)
		if (Array.isArray(field.defaultValue)) {
			for (const entry of value as unknown[]) {
				const row = object(entry)
				const columns = key === "server_cmd" ? ["name", "cmd"] : ["do", "undo"]
				if (!columns.some((column) => typeof row[column] === "string"))
					throw new Error(`${field.label}: comando sem estrutura válida.`)
				for (const column of columns)
					if (row[column] !== undefined && typeof row[column] !== "string")
						throw new Error(`${field.label}: os comandos devem ser textos.`)
				if (row.elevated !== undefined && typeof row.elevated !== "boolean")
					throw new Error(`${field.label}: elevated deve ser true ou false.`)
			}
		}
		if (key === "dd_mode_remapping") {
			for (const group of Object.values(object(value))) {
				if (!Array.isArray(group)) throw new Error("As regras de display devem ser listas.")
				for (const row of group)
					for (const cell of Object.values(object(row)))
						if (typeof cell !== "string")
							throw new Error("Os valores das regras de display devem ser textos.")
			}
		}
	}
	serializeSettings({ ...draftFrom({ values: {}, platform: "", version: "" }), ...settings })
	return structuredClone(settings)
}

export async function sectionArchive(section: SettingSection, savedSettings?: Document) {
	const file = savedSettings
		? { ...sectionTemplate(section), settings: savedSettings }
		: sectionTemplate(section)
	parseSectionTemplate(JSON.stringify(file), section)
	return configurationArchive(`apollo-${section.id}`, {
		"configuracao.json": `${JSON.stringify(file, null, 2)}\n`,
		"LEIA-ME.md": sectionDocumentation(section, savedSettings ? "saved" : "section")
	})
}
