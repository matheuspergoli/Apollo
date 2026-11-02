import { strFromU8 } from "fflate"
import sections from "../src/features/settings/schema.json" with { type: "json" }

function requireKeys(
	value: unknown,
	expected: string[],
	label: string
): asserts value is Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
	)
		throw new Error(`${label}: exported inventory does not match the settings schema`)
}

// The portable exporter tests and the isolated native browser download use this
// same observable archive contract. No duplicated section/file counts can drift.
export function assertGlobalArchive(
	files: Record<string, Uint8Array>,
	kind: "saved" | "defaults"
) {
	const root = "apollo-configuracao"
	requireKeys(
		files,
		[
			`${root}/configuracao.json`,
			`${root}/LEIA-ME.md`,
			...sections.map((section) => `${root}/secoes/${section.id}.md`)
		],
		"Global configuration ZIP"
	)
	const configuration: unknown = JSON.parse(strFromU8(files[`${root}/configuracao.json`]))
	requireKeys(configuration, ["format", "version", "kind", "platform", "sections"], "Metadata")
	if (
		configuration.format !== "apollo-settings" ||
		configuration.version !== 1 ||
		configuration.kind !== kind ||
		!["windows", "linux", "unknown"].includes(String(configuration.platform))
	)
		throw new Error("Invalid global configuration metadata")
	const values = configuration.sections
	requireKeys(
		values,
		sections.map((section) => section.id),
		"Sections"
	)
	for (const section of sections) {
		requireKeys(
			values[section.id],
			section.fields.map((field) => field.key),
			section.id
		)
		const documentation = strFromU8(files[`${root}/secoes/${section.id}.md`])
		for (const field of section.fields)
			if (!documentation.includes(`\`${field.key}\``))
				throw new Error(`Missing exported documentation: ${field.key}`)
	}
}
