import { strFromU8, unzipSync } from "fflate"
import { expect, it } from "vitest"
import {
	applicationBundleArchive,
	exportedApplicationBundle,
	parseApplicationBundle
} from "./bundle"
import { exportedApplication, parseApplicationFile } from "./configuration"
import { appDraft } from "./model"

it("roundtrips original script bytes and arguments without exporting local identities", async () => {
	const file = { name: "example.ps1", data: btoa("# original\r\n") }
	const reference = { file, arguments: ["literal with spaces"] }
	const draft = appDraft({
		name: "Example",
		uuid: "local-identity",
		custom: "private",
		"cmd-script": reference,
		"prep-cmd": [{ do: "", "do-script": reference, elevated: true }],
		"state-cmd": [{ undo: "", "undo-script": reference }]
	})
	const bundle = await exportedApplicationBundle(draft)
	expect(bundle.application).not.toHaveProperty("uuid")
	expect(bundle.application).not.toHaveProperty("custom")
	expect(bundle.application["cmd-script"]).toEqual(reference)
	expect(bundle.application["prep-cmd"][0].elevated).toBe(true)
	const files = unzipSync(
		new Uint8Array(await (await applicationBundleArchive(bundle)).arrayBuffer())
	)
	expect(
		parseApplicationBundle(strFromU8(files["apollo-aplicativo/aplicativo.json"]))
	).toEqual(bundle)
	expect(draft.uuid).toBe("local-identity")
	expect(() => exportedApplication(draft)).toThrow("preservar os vínculos")
})

it("rejects host-local references, identity transfer, unsupported versions and mixed commands in bundles", async () => {
	const bundle = await exportedApplicationBundle(
		appDraft({
			name: "Example",
			"cmd-script": { file: { name: "example.ps1", data: btoa("# test") } }
		})
	)
	for (const value of [
		{ ...bundle, version: 2 },
		{ ...bundle, application: { ...bundle.application, uuid: "foreign" } },
		{ ...bundle, application: { ...bundle.application, cmd: "manual" } },
		{
			...bundle,
			application: {
				...bundle.application,
				"cmd-script": { id: "a".repeat(32), revision: "b".repeat(64) }
			}
		}
	])
		expect(() => parseApplicationBundle(JSON.stringify(value))).toThrow()
})

it("roundtrips detached script bytes, arguments and ordering without widening the legacy format", async () => {
	const reference = {
		file: { name: "monitor.ps1", data: btoa("# Test-owned monitor\r\n") },
		arguments: ["literal"]
	}
	const detached = ["manual before", { cmd: "", "cmd-script": reference }, "manual after"]
	const draft = appDraft({ name: "Example", cmd: "example.exe", detached })
	const bundle = await exportedApplicationBundle(draft)
	expect(parseApplicationBundle(JSON.stringify(bundle)).application.detached).toEqual(detached)
	expect(bundle.application.cmd).toBe("example.exe")
	expect(() => exportedApplication(draft)).toThrow("preservar os vínculos")
	expect(
		parseApplicationFile(
			JSON.stringify({
				format: "apollo-application",
				version: 1,
				kind: "application",
				application: { name: "Edited name" }
			}),
			draft
		).application
	).toEqual({ name: "Edited name" })
	expect(draft.detached).toEqual(detached)
})
