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
	if (mode === "saved")
		return `# Apollo — ${section.title}: valores salvos\n\nEste pacote contém os campos conhecidos desta seção lidos novamente do arquivo do host, com padrões para campos ausentes. Não inclui o rascunho não salvo nem outras seções. O ZIP não é criptografado: comandos, nomes e caminhos podem ser privados.\n\nEdite apenas settings em configuracao.json (UTF-8, até 256 KiB). Mantenha format="${format}", version=1 e section="${section.id}". Importe o JSON na mesma seção, revise e aplique ao rascunho. Somente Revisar e salvar grava; não há reinício automático. Campos omitidos são preservados, listas/objetos presentes substituem o campo inteiro. Não compartilhe sem revisão. Importar não transfere arquivos ou certificados.\n\nOs padrões abaixo são referência, não necessariamente os valores exportados. Revise comandos/elevação e mudanças de porta antes de aplicar. A porta do painel é a base + 1.\n\n${blocks.join("\n\n")}\n`
	return `# Apollo — ${section.title}\n\n## Como usar\n\n1. Edite apenas os valores de \`settings\` em \`configuracao.json\`. O template contém os padrões do aplicativo, não seus dados privados nem os valores atuais do host.\n2. Importe o JSON na seção **${section.title}**. Não importe o ZIP.\n3. Confira o resumo e confirme a aplicação ao rascunho. Nada é enviado ao host nesse passo.\n4. Use **Revisar e salvar** para gravar pelo fluxo normal. Salvar não reinicia.\n\nFormato: \`format: "${format}"\`, \`version: 1\`, \`section: "${section.id}"\`. Não altere esses identificadores. O arquivo deve ser UTF-8, até 256 KiB, sem comentários. Números usam ponto decimal e não levam aspas. Opções booleanas do host usam os textos listados, como \`"enabled"\` e \`"disabled"\`.\n\nVocê pode remover chaves de \`settings\` para manter os valores atuais desses campos. Uma chave presente substitui o valor inteiro do campo, inclusive listas e objetos; listas vazias removem comandos/regras daquele campo. Chaves de outra seção, versões desconhecidas e valores inválidos são rejeitados integralmente.\n\n## Segurança\n\nRevise comandos e elevação antes de importar: eles podem executar no computador quando os eventos ocorrerem. Caminhos de certificados/credenciais apontam para arquivos no host, não transferem arquivos nem devem conter chaves privadas no JSON. Alterações de rede podem impedir acesso; HDR/display dependem do driver e do hardware. O template não instala drivers nem promete ganhos de desempenho.\n\n## Estruturas e exemplos\n\nComandos de preparação/estado:\n\n\`\`\`json\n[{"do":"echo iniciar","undo":"echo desfazer","elevated":false}]\n\`\`\`\n\nComandos de servidor:\n\n\`\`\`json\n[{"name":"Exemplo","cmd":"echo exemplo","elevated":false}]\n\`\`\`\n\nRegras de display:\n\n\`\`\`json\n{"mixed":[{"requested_resolution":"1920x1080","requested_fps":"60","final_resolution":"1920x1080","final_refresh_rate":"60"}],"resolution_only":[],"refresh_rate_only":[]}\n\`\`\`\n\nEsses exemplos só se aplicam aos campos correspondentes da seção; não são executados ou incluídos automaticamente.\n\n## Campos desta seção\n\n${blocks.join("\n")}\n`
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
