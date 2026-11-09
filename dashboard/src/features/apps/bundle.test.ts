import { strFromU8, unzipSync } from "fflate"
import { expect, it } from "vitest"
import {
	applicationBundleArchive,
	exportedApplicationBundle,
	parseApplicationBundle
} from "./bundle"
import { exportedApplication } from "./configuration"
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
