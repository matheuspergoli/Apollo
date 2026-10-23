import { strFromU8, unzipSync } from "fflate"
import { expect, it } from "vitest"
import {
	deviceArchive,
	deviceFileLimit,
	deviceTemplate,
	exportedDevice,
	parseDeviceFile
} from "./configuration"
import { deviceDraft, permissions } from "./model"

const current = () =>
	deviceDraft({
		uuid: "local-device",
		name: "Private name",
		perm: 0x03000000,
		connected: true,
		certificate: "not-exported",
		custom: "keep"
	})

it("roundtrips a conservative permission template and documents all bits", async () => {
	const template = deviceTemplate()
	expect(template.settings.perm).toBe(0x03000000)
	expect(template.settings.allow_client_commands).toBe(false)
	expect(parseDeviceFile(JSON.stringify(template), current()).settings).toEqual(
		template.settings
	)
	const files = unzipSync(new Uint8Array(await (await deviceArchive(template)).arrayBuffer()))
	expect(Object.keys(files)).toHaveLength(3)
	for (const permission of permissions)
		expect(strFromU8(files["apollo-dispositivo/LEIA-ME.md"])).toContain(permission.label)
	expect(files["apollo-dispositivo/schema.json"]).toBeDefined()
})

it("exports draft permissions but never device identity, name, certificate or connected state", () => {
	const draft = current()
	const exported = exportedDevice(draft)
	const raw = JSON.stringify(exported)
	for (const text of [
		"local-device",
		"Private name",
		"not-exported",
		"certificate",
		"connected"
	])
		expect(raw).not.toContain(text)
	expect(draft.certificate).toBe("not-exported")
})

it("applies only present options to the existing identity and does not mutate input", () => {
	const draft = current()
	const parsed = parseDeviceFile(
		JSON.stringify({ ...deviceTemplate(), settings: { perm: 0x03000100 } }),
		draft
	)
	expect({ ...draft, ...parsed.settings }).toMatchObject({
		uuid: "local-device",
		name: "Private name",
		custom: "keep",
		perm: 0x03000100
	})
	expect(draft.perm).toBe(0x03000000)
})

it.each([
	{ uuid: "other" },
	{ name: "other" },
	{ connected: true },
	{ certificate: "x" },
	{ perm: 1 },
	{ perm: 0x80000000 },
	{ perm: 1.5 },
	{ perm: "50331648" },
	{ display_mode: "0x1080x120" },
	{ display_mode: "1920x1080x0" },
	{ allow_client_commands: "false" },
	{ do: [null] },
	{ undo: [{ cmd: "echo x", elevated: "true" }] }
])("rejects unsafe identity or invalid permission fields: %j", (settings) => {
	expect(() =>
		parseDeviceFile(JSON.stringify({ ...deviceTemplate(), settings }), current())
	).toThrow()
})

it("rejects malformed envelopes, excess size and unknown existing permission bits", () => {
	for (const patch of [
		{ version: 2 },
		{ settings: {} },
		{ uuid: "other" },
		{ $schema: "https://example.invalid/schema" }
	])
		expect(() =>
			parseDeviceFile(JSON.stringify({ ...deviceTemplate(), ...patch }), current())
		).toThrow()
	expect(() => parseDeviceFile(" ".repeat(deviceFileLimit + 1), current())).toThrow()
	expect(() => exportedDevice({ ...current(), perm: 0x43000000 })).toThrow()
	expect(() =>
		exportedDevice({ ...current(), allow_client_commands: "not-a-boolean" })
	).toThrow()
})
