import { type Document, object } from "@/lib/documents"
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

export function sectionDocumentation(section: SettingSection) {
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
	return `# Apollo — ${section.title}\n\n## Como usar\n\n1. Edite apenas os valores de \`settings\` em \`configuracao.json\`. O template contém os padrões do aplicativo, não seus dados privados nem os valores atuais do host.\n2. Importe o JSON na seção **${section.title}**. Não importe o ZIP.\n3. Confira o resumo e confirme a aplicação ao rascunho. Nada é enviado ao host nesse passo.\n4. Use **Revisar e salvar** para gravar pelo fluxo normal. Salvar não reinicia.\n\nFormato: \`format: "${format}"\`, \`version: 1\`, \`section: "${section.id}"\`. Não altere esses identificadores. O arquivo deve ser UTF-8, até 256 KiB, sem comentários. Números usam ponto decimal e não levam aspas. Opções booleanas do host usam os textos listados, como \`"enabled"\` e \`"disabled"\`.\n\nVocê pode remover chaves de \`settings\` para manter os valores atuais desses campos. Uma chave presente substitui o valor inteiro do campo, inclusive listas e objetos; listas vazias removem comandos/regras daquele campo. Chaves de outra seção, versões desconhecidas e valores inválidos são rejeitados integralmente.\n\n## Segurança\n\nRevise comandos e elevação antes de importar: eles podem executar no computador quando os eventos ocorrerem. Caminhos de certificados/credenciais apontam para arquivos no host, não transferem arquivos nem devem conter chaves privadas no JSON. Alterações de rede podem impedir acesso; HDR/display dependem do driver e do hardware. O template não instala drivers nem promete ganhos de desempenho.\n\n## Estruturas e exemplos\n\nComandos de preparação/estado:\n\n\`\`\`json\n[{"do":"echo iniciar","undo":"echo desfazer","elevated":false}]\n\`\`\`\n\nComandos de servidor:\n\n\`\`\`json\n[{"name":"Exemplo","cmd":"echo exemplo","elevated":false}]\n\`\`\`\n\nRegras de display:\n\n\`\`\`json\n{"mixed":[{"requested_resolution":"1920x1080","requested_fps":"60","final_resolution":"1920x1080","final_refresh_rate":"60"}],"resolution_only":[],"refresh_rate_only":[]}\n\`\`\`\n\nEsses exemplos só se aplicam aos campos correspondentes da seção; não são executados ou incluídos automaticamente.\n\n## Campos desta seção\n\n${blocks.join("\n")}\n`
}

function checkStructure(value: unknown, depth = 0) {
	if (depth > 20) throw new Error("O JSON tem níveis de estrutura demais.")
	if (!value || typeof value !== "object") return
	for (const [key, child] of Object.entries(value)) {
		if (["__proto__", "prototype", "constructor"].includes(key))
			throw new Error("O JSON contém uma chave insegura.")
		checkStructure(child, depth + 1)
	}
}

export function parseSectionTemplate(raw: string, section: SettingSection): Document {
	if (new TextEncoder().encode(raw).length > templateLimit)
		throw new Error("Use um JSON de até 256 KiB.")
	let parsed: unknown
	try {
		parsed = JSON.parse(raw.replace(/^\uFEFF/, ""))
	} catch {
		throw new Error("JSON inválido. Confira aspas, vírgulas e a documentação do template.")
	}
	checkStructure(parsed)
	const root = object(parsed)
	if (
		Object.keys(root).some(
			(key) => !["format", "version", "section", "settings"].includes(key)
		)
	)
		throw new Error("O arquivo contém propriedades fora do formato do template.")
	if (root.format !== format || root.version !== 1)
		throw new Error("Formato ou versão de template não suportado.")
	if (root.section !== section.id)
		throw new Error(`Este template não pertence à seção ${section.title}.`)
	const settings = object(root.settings)
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

export async function sectionArchive(section: SettingSection) {
	const { zipSync, strToU8 } = await import("fflate")
	const folder = `apollo-${section.id}`
	const bytes = zipSync({
		[`${folder}/configuracao.json`]: strToU8(
			`${JSON.stringify(sectionTemplate(section), null, 2)}\n`
		),
		[`${folder}/LEIA-ME.md`]: strToU8(sectionDocumentation(section))
	})
	return new Blob([new Uint8Array(bytes)], { type: "application/zip" })
}
