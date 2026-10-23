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
	type SettingSection,
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

export function sectionSavedValues(section: SettingSection, snapshot: Snapshot): Document {
	const draft = draftFrom(snapshot)
	return validateSectionSettings(
		Object.fromEntries(
			section.fields.map((field) => [field.key, canonicalValue(field, draft[field.key])])
		),
		section
	)
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
	return `# Apollo — configuração global

Este pacote contém ${configuration.kind === "saved" ? "os valores dos campos conhecidos do arquivo salvo, lidos do host no momento da exportação; não inclui o rascunho não salvo" : `os padrões das ${sections.length} seções, não uma cópia dos valores atuais`}. Plataforma de origem: ${configuration.platform}.

## Conteúdo

- configuracao.json: JSON editável e importável.
- secoes/: referência de todos os campos, padrões, opções e limites.

São ${sections.reduce((total, section) => total + section.fields.length, 0)} campos de Windows e Linux. O painel mostra apenas as seções da plataforma do host; o arquivo completo inclui todas. Não inclui conta/senhas, pareamentos, aplicativos, conteúdo de certificados/chaves, logs ou chaves desconhecidas. Isto não é backup da instalação inteira. Caminhos e comandos podem conter dados privados: guarde o ZIP com cuidado. A exportação é local e não envia arquivos a serviços externos.

## Importação segura

1. Extraia o ZIP e edite configuracao.json em UTF-8. Importe o JSON, não o ZIP. Limite: 1 MiB.
2. Mantenha format="${format}", version=1, kind e platform. Valores ficam em sections.<id>.<chave>.
3. Use **Importar configuração completa**, revise e confirme **Aplicar tudo ao rascunho**.
4. Só **Revisar e salvar** grava o host. Importar não reinicia e não instala drivers.

Uma seção inválida rejeita o arquivo inteiro antes de alterar o rascunho. Seções e campos omitidos permanecem como estão; campos presentes substituem o valor inteiro, inclusive listas vazias. Chaves desconhecidas do host são preservadas pelo salvamento normal, mas não são exportadas ou aceitas neste formato.

## Rede e dados privados

Importar padrões pode trocar a porta ou reativar descoberta/bandeja. Remova do JSON as chaves que deseja manter. A porta do painel é a porta base + 1: base 50989 corresponde a 50990. Revise comandos, elevação e caminhos. Não coloque senhas nem chaves privadas no JSON e não compartilhe exportações sem revisá-las.

## Exemplo parcial

Altera apenas a porta, preservando o restante:

\`\`\`json
${JSON.stringify({ format, version: 1, kind: "saved", platform: configuration.platform, sections: { network: { port: 50989 } } }, null, 2)}
\`\`\`

## Estruturas complexas

Comandos de preparação/estado: [{"do":"echo iniciar","undo":"echo desfazer","elevated":false}].
Comandos de servidor: [{"name":"Exemplo","cmd":"echo exemplo","elevated":false}].
Regras de display: {"mixed":[],"resolution_only":[],"refresh_rate_only":[]}.
Consulte secoes/ para tipos, opções e limites. Os exemplos não são executados automaticamente.
`
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
