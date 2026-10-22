import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"
import {
	globalArchive,
	globalConfigurationLimit,
	globalDocumentation,
	globalTemplate,
	parseGlobalConfiguration,
	savedConfiguration
} from "./global-configuration"
import { fields, type Snapshot, sections } from "./model"

const snapshot = (values: Snapshot["values"] = {}): Snapshot => ({
	values,
	platform: "windows",
	version: "test"
})

describe("global configuration files", () => {
	it("roundtrips all 102 known defaults in 12 sections with complete ZIP documentation", async () => {
		const configuration = globalTemplate("windows")
		const parsed = parseGlobalConfiguration(JSON.stringify(configuration))
		expect(parsed.sectionIds).toHaveLength(12)
		expect(Object.keys(parsed.values)).toHaveLength(102)
		const files = unzipSync(
			new Uint8Array(await (await globalArchive(configuration)).arrayBuffer())
		)
		expect(Object.keys(files)).toHaveLength(14)
		expect(JSON.parse(strFromU8(files["apollo-configuracao/configuracao.json"]))).toEqual(
			configuration
		)
		for (const section of sections) {
			const docs = strFromU8(files[`apollo-configuracao/secoes/${section.id}.md`])
			for (const field of section.fields) expect(docs).toContain(field.key)
		}
		expect(globalDocumentation(configuration)).toContain("os padrões das 12 seções")
	})

	it("exports saved known fields with canonical types, not unknown secrets or response metadata", () => {
		const source = snapshot({
			sunshine_name: "Host ç",
			port: "50989",
			nvenc_preset: "3",
			controller: "true",
			global_prep_cmd: '[{"do":"echo test","undo":"","elevated":"false"}]',
			password: "not-exported",
			unknown_private: "not-exported-either",
			locale: "en"
		})
		const before = JSON.stringify(source)
		const configuration = savedConfiguration(source)
		const parsed = parseGlobalConfiguration(JSON.stringify(configuration))
		expect(parsed.values).toMatchObject({
			sunshine_name: "Host ç",
			port: 50989,
			nvenc_preset: 3,
			controller: "enabled",
			global_prep_cmd: [{ do: "echo test", undo: "", elevated: false }]
		})
		expect(JSON.stringify(configuration)).not.toContain("not-exported")
		expect(parsed.values).not.toHaveProperty("locale")
		expect(parsed.values).not.toHaveProperty("status")
		expect(JSON.stringify(source)).toBe(before)
		expect(globalDocumentation(configuration)).toContain("não inclui o rascunho não salvo")
	})

	it("returns only provided fields so omitted sections and unknown host keys can be preserved", () => {
		const data = {
			...globalTemplate("windows"),
			sections: { general: { sunshine_name: "Novo" }, nv: { nvenc_preset: 4 } }
		}
		const parsed = parseGlobalConfiguration(JSON.stringify(data))
		expect(parsed.values).toEqual({ sunshine_name: "Novo", nvenc_preset: 4 })
		expect({ future_key: "keep", port: "50989", ...parsed.values }).toMatchObject({
			future_key: "keep",
			port: "50989"
		})
	})

	it("rejects the entire file if a later section is invalid", () => {
		const data = {
			...globalTemplate("windows"),
			sections: { general: { sunshine_name: "Valid" }, network: { port: 65535 } }
		}
		expect(() => parseGlobalConfiguration(JSON.stringify(data))).toThrow()
	})

	it.each([
		{ version: 2 },
		{ kind: "arbitrary" },
		{ platform: "arbitrary" },
		{ sections: {} },
		{ sections: [] },
		{ sections: { unknown: { port: 50989 } } },
		{ sections: { nv: { sunshine_name: "other section" } } },
		{ sections: { general: { locale: "en" } } },
		{ password: "not supported" },
		{ sections: { nv: { nvenc_preset: "3" } } },
		{ sections: { network: { port: 50989.5 } } }
	])("rejects malformed metadata, sections and fields: %j", (patch) => {
		expect(() =>
			parseGlobalConfiguration(JSON.stringify({ ...globalTemplate("windows"), ...patch }))
		).toThrow()
	})

	it("rejects unsafe keys, deep structures, oversized or malformed JSON", () => {
		for (const raw of [
			'{"__proto__":{}}',
			'{"sections":{"constructor":{}}}',
			"[1]",
			"broken",
			" ".repeat(globalConfigurationLimit + 1)
		])
			expect(() => parseGlobalConfiguration(raw)).toThrow()
		let deep: unknown = {}
		for (let index = 0; index < 25; index++) deep = { nested: deep }
		expect(() => parseGlobalConfiguration(JSON.stringify(deep))).toThrow()
	})

	it("never exports malformed saved data as an apparently valid backup", () => {
		for (const values of [
			{ port: "invalid" },
			{ global_prep_cmd: "broken" },
			{ nvenc_preset: "99" }
		])
			expect(() => savedConfiguration(snapshot(values))).toThrow()
	})

	it("has exactly one documented global location for every known setting", () => {
		const configuration = globalTemplate("windows")
		const keys = Object.values(configuration.sections).flatMap(Object.keys)
		expect(new Set(keys).size).toBe(fields.length)
		expect(keys).toHaveLength(fields.length)
	})
})
