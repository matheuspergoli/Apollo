import { describe, expect, it } from "vitest"
import { bool } from "@/lib/documents"
import {
	changedKeys,
	draftFrom,
	fields,
	fingerprint,
	sections,
	serializeSettings,
	snapshot,
	visibleSections
} from "./model"

const base = (values: Record<string, unknown> = {}) =>
	snapshot({
		status: true,
		platform: "windows",
		version: "test",
		vdisplayStatus: 0,
		...values
	})

describe("configuration migration inventory", () => {
	it("covers all 102 active backend settings without duplicates across 12 groups", () => {
		expect(fields).toHaveLength(102)
		expect(new Set(fields.map((field) => field.key)).size).toBe(102)
		expect(sections).toHaveLength(12)
		expect(fields.every((field) => field.label && field.key)).toBe(true)
	})
	it("filters only platform-inapplicable encoder sections without deleting their stored keys", () => {
		expect(visibleSections("windows").map((section) => section.id)).not.toContain("vt")
		expect(visibleSections("windows").map((section) => section.id)).not.toContain("vaapi")
		const serialized = serializeSettings(
			draftFrom(base({ vt_coder: "cabac", custom_encoder_flag: "keep" }))
		)
		expect(serialized.vt_coder).toBe("cabac")
		expect(serialized.custom_encoder_flag).toBe("keep")
	})
	it("does not write defaults, response metadata or mutate the loaded document", () => {
		const original = base()
		const draft = draftFrom(original)
		expect(serializeSettings(draft)).toEqual({})
		expect(original.values).toEqual({})
		expect(draft.port).toBe(47989)
	})
})

describe("safe full-file save", () => {
	it("removes unsupported locale instead of retaining opaque compatibility data", () => {
		expect(
			visibleSections("windows")
				.flatMap((section) => section.fields)
				.some((field) => field.key === "locale")
		).toBe(false)
		expect(serializeSettings(draftFrom(base({ locale: "de" })))).not.toHaveProperty("locale")
	})
	it("preserves unusual own keys without treating them as object prototypes", () => {
		const original = snapshot(
			JSON.parse('{"status":true,"__proto__":"keep","constructor":"also-keep"}')
		)
		const payload = serializeSettings(draftFrom(original))
		expect(Object.hasOwn(payload, "__proto__")).toBe(true)
		expect(Object.getOwnPropertyDescriptor(payload, "__proto__")?.value).toBe("keep")
		expect(Object.getOwnPropertyDescriptor(payload, "constructor")?.value).toBe("also-keep")
	})
	it("preserves unrelated unknown keys and every command/remapping structure", () => {
		const rules = {
			mixed: [
				{
					requested_resolution: "1920x1080",
					requested_fps: "120",
					final_resolution: "1920x1080",
					final_refresh_rate: "120",
					future: "keep"
				}
			],
			resolution_only: [],
			refresh_rate_only: []
		}
		const original = base({
			future_option: "keep-me",
			dd_mode_remapping: JSON.stringify(rules),
			global_prep_cmd: '[{"do":"prepare","undo":"restore","elevated":false}]',
			global_state_cmd: '[{"do":"connect","undo":"disconnect"}]',
			server_cmd: '[{"name":"Utility","cmd":"safe-test"}]'
		})
		const draft = draftFrom(original)
		draft.sunshine_name = "Edited"
		const payload = serializeSettings(draft)
		expect(payload.future_option).toBe("keep-me")
		expect(payload.dd_mode_remapping).toEqual(rules)
		expect(payload.global_prep_cmd).toEqual([
			{ do: "prepare", undo: "restore", elevated: false }
		])
		expect(payload.global_state_cmd).toEqual([{ do: "connect", undo: "disconnect" }])
		expect(payload.server_cmd).toEqual([{ name: "Utility", cmd: "safe-test" }])
		expect(original.values.sunshine_name).toBeUndefined()
	})
	it("compares native string values to frontend numbers and parsed JSON semantically", () => {
		expect(fingerprint(base({ port: "49989", global_prep_cmd: "[]" }))).toBe(
			fingerprint(base({ port: 49989, global_prep_cmd: [] }))
		)
		expect(changedKeys({ port: 49989 }, { port: "49989" })).toEqual([])
	})
	it.each([1028, 65515, "not-a-number"])("rejects unsafe port %s", (port) => {
		const draft = draftFrom(base())
		draft.port = port
		expect(() => serializeSettings(draft)).toThrow()
	})
	it("rejects newline injection and invalid fallback/display rules", () => {
		for (const values of [
			{ sunshine_name: "name\nport = 1" },
			{ fallback_mode: "broken" },
			{
				dd_mode_remapping: {
					mixed: [{ final_resolution: "invalid" }],
					resolution_only: [],
					refresh_rate_only: []
				}
			}
		]) {
			expect(() => serializeSettings({ ...draftFrom(base()), ...values })).toThrow()
		}
	})
	it("keeps malformed existing JSON visible for explicit recovery rather than resetting it", () => {
		const draft = draftFrom(base({ global_prep_cmd: "broken json" }))
		expect(draft.global_prep_cmd).toBe("broken json")
		expect(() => serializeSettings(draft)).toThrow()
	})
	it("renders the same accepted boolean aliases as the native host", () => {
		for (const value of [true, 1, "true", "YES", "enabled", "enable", "on", "1"])
			expect(bool(value)).toBe(true)
		for (const value of [false, 0, "false", "disabled", "off", "0"])
			expect(bool(value)).toBe(false)
	})
})
