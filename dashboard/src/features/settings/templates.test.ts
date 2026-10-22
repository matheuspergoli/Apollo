import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import { sections } from "./model"
import {
	parseSectionTemplate,
	sectionArchive,
	sectionDocumentation,
	sectionTemplate
} from "./templates"

describe("documented section templates", () => {
	for (const section of sections) {
		it(`roundtrips all defaults and documents every ${section.id} field`, async () => {
			const template = sectionTemplate(section)
			expect(parseSectionTemplate(JSON.stringify(template), section)).toEqual(
				template.settings
			)
			const docs = sectionDocumentation(section)
			for (const field of section.fields) {
				expect(docs).toContain(field.key)
				for (const option of field.options || [])
					expect(docs).toContain(
						JSON.stringify(
							typeof field.defaultValue === "number" ? Number(option.value) : option.value
						)
					)
			}
			const archive = unzipSync(
				new Uint8Array(await (await sectionArchive(section)).arrayBuffer())
			)
			expect(Object.keys(archive).sort()).toEqual([
				`apollo-${section.id}/LEIA-ME.md`,
				`apollo-${section.id}/configuracao.json`
			])
			expect(JSON.parse(strFromU8(archive[`apollo-${section.id}/configuracao.json`]))).toEqual(
				template
			)
		})
	}
	const nv = sections.find((section) => section.id === "nv")
	if (!nv) throw new Error("Missing NVENC section fixture")
	it("rejects other sections, unsupported versions, unknown keys, types and unsafe input", () => {
		const template = sectionTemplate(nv)
		for (const patch of [
			{ section: "amd" },
			{ version: 2 },
			{ settings: { port: 1234 } },
			{ settings: { nvenc_preset: 99 } },
			{ settings: {} },
			{ locale: "en" },
			{ settings: { nvenc_preset: "invalid" } },
			{ settings: null }
		])
			expect(() =>
				parseSectionTemplate(JSON.stringify({ ...template, ...patch }), nv)
			).toThrow()
		expect(() => parseSectionTemplate('{"__proto__":{}}', nv)).toThrow()
		expect(() => parseSectionTemplate(" ".repeat(256 * 1024 + 1), nv)).toThrow()
		expect(() => parseSectionTemplate("{broken", nv)).toThrow()
	})
	it("accepts a partial section without adding omitted keys or mutating input", () => {
		const template = { ...sectionTemplate(nv), settings: { nvenc_preset: 2 } }
		expect(parseSectionTemplate(JSON.stringify(template), nv)).toEqual(template.settings)
	})
	it("rejects malformed boolean, command and display values without producing a patch", () => {
		for (const [key, value] of [
			["system_tray", "maybe"],
			["global_prep_cmd", [{ do: 42, undo: "" }]],
			["global_prep_cmd", [{ do: "echo test", elevated: "true" }]],
			[
				"dd_mode_remapping",
				{ mixed: [{ final_resolution: 42 }], resolution_only: [], refresh_rate_only: [] }
			]
		] as const) {
			const section = sections.find((section) =>
				section.fields.some((field) => field.key === key)
			)
			if (!section) throw new Error("Missing fixture section")
			expect(() =>
				parseSectionTemplate(
					JSON.stringify({ ...sectionTemplate(section), settings: { [key]: value } }),
					section
				)
			).toThrow()
		}
	})
})
