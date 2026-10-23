import {
	configurationArchive,
	parseContract,
	readConfigurationJson
} from "@/lib/configuration-files"
import { type Document, object } from "@/lib/documents"
import { globalFileSchema } from "./file-contracts"
import {
	draftFrom,
	type SettingField,
	type Snapshot,
	sections,
	serializeSettings
} from "./model"
import { sectionDocumentation, sectionTemplate, validateSectionSettings } from "./templates"

export const globalConfigurationLimit = 1024 * 1024
const format = "apollo-settings"
export type GlobalConfiguration = {
	format: typeof format
	version: 1
	kind: "saved" | "defaults"
	platform: string
	sections: Record<string, Document>
}
export type GlobalImport = {
	values: Document
	platform: string
	kind: "saved" | "defaults"
	sectionIds: string[]
}

function canonicalValue(field: SettingField, value: unknown): unknown {
	if (typeof field.defaultValue === "number" && typeof value === "string") {
		return value.trim() === "" ? field.defaultValue : Number(value)
	}
	if (["enabled", "disabled"].includes(String(field.defaultValue)) && !field.options) {
		const raw = String(value).trim().toLowerCase()
		if (["true", "yes", "on", "enable", "enabled", "1"].includes(raw)) return "enabled"
		if (["false", "no", "off", "disable", "disabled", "0"].includes(raw)) return "disabled"
	}
	if (Array.isArray(field.defaultValue) && Array.isArray(value))
		return value.map((entry) => {
			const row = object(entry)
			if (row.elevated === undefined || typeof row.elevated === "boolean") return row
			const raw = String(row.elevated).trim().toLowerCase()
			if (["true", "1"].includes(raw)) return { ...row, elevated: true }
			if (["false", "0"].includes(raw)) return { ...row, elevated: false }
			return row
		})
	return value
}

export function globalTemplate(platform: string): GlobalConfiguration {
	return {
		format,
		version: 1,
		kind: "defaults",
		platform: platform || "unknown",
		sections: Object.fromEntries(
			sections.map((section) => [section.id, sectionTemplate(section).settings])
		)
	}
}

export function savedConfiguration(snapshot: Snapshot): GlobalConfiguration {
	const draft = draftFrom(snapshot)
	const result: GlobalConfiguration = {
		format,
		version: 1,
		kind: "saved",
		platform: snapshot.platform || "unknown",
		sections: Object.fromEntries(
			sections.map((section) => [
				section.id,
				Object.fromEntries(
					section.fields.map((field) => [field.key, canonicalValue(field, draft[field.key])])
				)
			])
		)
	}
	// Do not produce a backup that cannot be imported, or silently discard malformed fields.
	parseGlobalConfiguration(JSON.stringify(result))
	return structuredClone(result)
}

export function parseGlobalConfiguration(raw: string): GlobalImport {
	const root = parseContract(
		globalFileSchema,
		readConfigurationJson(raw, globalConfigurationLimit),
		"Arquivo global inválido"
	)
	const groups = object(root.sections)
	if (Object.keys(groups).length === 0)
		throw new Error("O arquivo global não contém seções para importar.")
	const entries = Object.entries(groups).flatMap(([id, values]) => {
		const section = sections.find((section) => section.id === id)
		if (!section) throw new Error(`Seção desconhecida: ${id}.`)
		return Object.entries(validateSectionSettings(values, section))
	})
	const values = Object.fromEntries(entries)
	serializeSettings({ ...draftFrom({ values: {}, platform: "", version: "" }), ...values })
	return { values, platform: root.platform, kind: root.kind, sectionIds: Object.keys(groups) }
}

export function globalDocumentation(configuration: GlobalConfiguration) {
	return `# Apollo — configuração global\n\nEste pacote contém ${configuration.kind === "saved" ? "os valores dos campos conhecidos do arquivo salvo, lidos do host no momento da exportação; não inclui o rascunho não salvo" : "os padrões das 12 seções, não uma cópia dos valores atuais"}. Plataforma de origem: ${configuration.platform}.\n\n## Conteúdo\n\n- configuracao.json: JSON editável e importável.\n- secoes/: referência de todos os campos, padrões, opções e limites.\n\nSão 102 campos do painel, inclusive opções específicas de outras plataformas. Não são incluídos biblioteca de aplicativos, pareamentos, conta/senhas do painel, conteúdo de certificados/chaves, logs ou chaves desconhecidas do host. Isto não é backup da instalação inteira. Caminhos e comandos nos campos conhecidos podem conter dados privados: guarde o ZIP com cuidado. A exportação é local e não envia arquivos a serviços externos.\n\n## Importação segura\n\n1. Extraia o ZIP e edite configuracao.json em UTF-8. Importe o JSON, não o ZIP. Limite: 1 MiB; cada seção também deve respeitar a validação dos campos.\n2. Mantenha format="${format}", version=1, kind e platform. Valores ficam em sections.<id>.<chave>.\n3. Use **Importar configuração completa**, confira as diferenças e confirme **Aplicar tudo ao rascunho**.\n4. Só **Revisar e salvar** grava o host. Importar não reinicia e não instala drivers.\n\nSe qualquer seção for inválida, o arquivo inteiro é rejeitado antes de alterar o rascunho. Seções e campos omitidos permanecem como estão; campos presentes substituem o valor inteiro, inclusive listas vazias. Chaves desconhecidas já existentes no host são preservadas pelo salvamento normal, mas não são exportadas ou aceitas neste formato. Não altere opções de outra plataforma sem entender os efeitos.\n\n## Rede e dados privados\n\nImportar padrões pode trocar a porta do painel ou reativar descoberta/bandeja. Para manter uma opção, remova sua chave do JSON. A porta do painel é a porta base + 1: base 50989 corresponde a 50990, base 47989 corresponde a 47990. Revise comandos/elevacão e caminhos antes de aplicar. Não coloque senhas do painel nem chaves privadas no JSON. Não compartilhe uma exportação de valores atuais sem revisá-la.\n\n## Exemplo parcial\n\nEste exemplo altera apenas a porta, preservando o restante:\n\n\`\`\`json\n${JSON.stringify({ format, version: 1, kind: "saved", platform: configuration.platform, sections: { network: { port: 50989 } } }, null, 2)}\n\`\`\`\n\n## Estruturas complexas\n\nComandos de preparação/estado: [{"do":"echo iniciar","undo":"echo desfazer","elevated":false}].\nComandos de servidor: [{"name":"Exemplo","cmd":"echo exemplo","elevated":false}].\nRegras de display: {"mixed":[],"resolution_only":[],"refresh_rate_only":[]}.\nConsulte os campos em secoes/ para tipos, opções e limites. Os exemplos não são executados automaticamente.\n`
}

export async function globalArchive(configuration: GlobalConfiguration) {
	parseGlobalConfiguration(JSON.stringify(configuration))
	const files = Object.fromEntries(
		sections.map((section) => [
			`secoes/${section.id}.md`,
			sectionDocumentation(section, "reference")
		])
	)
	return configurationArchive("apollo-configuracao", {
		...files,
		"configuracao.json": `${JSON.stringify(configuration, null, 2)}\n`,
		"LEIA-ME.md": globalDocumentation(configuration)
	})
}
