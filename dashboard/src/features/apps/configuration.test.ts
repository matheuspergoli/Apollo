import { strFromU8, unzipSync } from "fflate"
import { expect, it } from "vitest"
import {
	applicationArchive,
	applicationDocumentation,
	applicationFileLimit,
	applicationTemplate,
	exportedApplication,
	parseApplicationFile
} from "./configuration"
import { appDefaults, appDraft } from "./model"
import { applicationOptionsSchema } from "./schema"

it("documents and roundtrips every editable app field, with a strict JSON schema", async () => {
	const template = applicationTemplate()
	expect(Object.keys(applicationOptionsSchema.shape).sort()).toEqual(
		Object.keys(appDefaults).sort()
	)
	expect(parseApplicationFile(JSON.stringify(template), appDraft()).application).toEqual(
		template.application
	)
	const docs = applicationDocumentation(template)
	for (const key of Object.keys(appDefaults)) expect(docs).toContain(key)
	const files = unzipSync(
		new Uint8Array(await (await applicationArchive(template)).arrayBuffer())
	)
	expect(Object.keys(files)).toHaveLength(3)
	expect(
		JSON.parse(strFromU8(files["apollo-aplicativo/schema.json"])).additionalProperties
	).toBe(false)
})

it("exports known editor values but never transfers UUID, host identity or unknown metadata", () => {
	const original = appDraft({
		uuid: "local-uuid",
		host_uuid: "host-uuid",
		name: "Jogo ç",
		custom: "keep",
		"exit-timeout": "10"
	})
	const file = exportedApplication(original)
	expect(file.application["exit-timeout"]).toBe(10)
	expect(JSON.stringify(file)).not.toContain("local-uuid")
	expect(JSON.stringify(file)).not.toContain("host-uuid")
	expect(file.application).not.toHaveProperty("custom")
	const imported = parseApplicationFile(JSON.stringify(file), original)
	expect({ ...original, ...imported.application }).toMatchObject({
		uuid: "local-uuid",
		custom: "keep"
	})
})

it("allows partial edits only when the merged application is valid, without mutation", () => {
	const original = appDraft({ uuid: "app-1", name: "Existing", custom: "keep" })
	const raw = JSON.stringify({ ...applicationTemplate(), application: { cmd: "echo test" } })
	expect(parseApplicationFile(raw, original).application).toEqual({ cmd: "echo test" })
	expect(original.cmd).toBe("")
	expect(() => parseApplicationFile(raw, appDraft())).toThrow()
})

it.each([
	{ uuid: "other-app" },
	{ host_uuid: "other-host" },
	{ unknown: true },
	{ elevated: "true" },
	{ "scale-factor": 100.5 },
	{ "scale-factor": 201 },
	{ "exit-timeout": -1 },
	{ "exit-timeout": "5" },
	{ gamepad: "unsupported" },
	{ "prep-cmd": [null] },
	{ "prep-cmd": [{ do: "test", elevated: "true" }] },
	{ "state-cmd": [{ do: "test", unknown: true }] },
	{ detached: [{ cmd: "test" }] },
	{ name: "bad\nname" },
	{ cmd: "echo\0test" }
])("rejects invalid or identity-changing app data: %j", (application) => {
	expect(() =>
		parseApplicationFile(
			JSON.stringify({ ...applicationTemplate(), application }),
			appDraft({ name: "Existing" })
		)
	).toThrow()
})

it("rejects malformed envelopes, empty/huge files and unsupported versions atomically", () => {
	for (const patch of [
		{ $schema: "https://example.invalid/schema.json" },
		{ version: 2 },
		{ format: "apollo-settings" },
		{ application: {} },
		{ application: [] },
		{ uuid: "forbidden" }
	])
		expect(() =>
			parseApplicationFile(JSON.stringify({ ...applicationTemplate(), ...patch }), appDraft())
		).toThrow()
	expect(() =>
		parseApplicationFile(" ".repeat(applicationFileLimit + 1), appDraft())
	).toThrow()
	expect(() => parseApplicationFile('{"constructor":{}}', appDraft())).toThrow()
	expect(() =>
		exportedApplication(appDraft({ name: "Bad", cmd: "x".repeat(16385) }))
	).toThrow()
})
