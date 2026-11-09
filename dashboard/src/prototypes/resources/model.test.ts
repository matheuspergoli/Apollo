import { describe, expect, it } from "vitest"
import {
	addScript,
	applyPackage,
	createPrototypeState,
	discardDraft,
	draftChanged,
	examplePackage,
	inspectScript,
	removeResource,
	resourceUses,
	revisionFor,
	saveSimulation,
	scriptLimit,
	validateDraft
} from "./model"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("isolated resource UX model", () => {
	it("retains exact BOM, CRLF and signature-like text bytes while decoding only for preview", async () => {
		const input = bytes('\uFEFF# Signature block\r\nWrite-Output "exemplo"\r\n')
		const file = await inspectScript("Exemplo ç.ps1", input)
		expect(file.bytes).toEqual(input)
		expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
		input.fill(0)
		expect(file.bytes[0]).toBe(239)
		expect(file.text).toContain("\r\n")
	})

	it("rejects unsupported files before they become resources", async () => {
		for (const [name, input] of [
			["script.exe", bytes("text")],
			["../script.ps1", bytes("text")],
			["script.ps1", new Uint8Array()],
			["script.ps1", new Uint8Array(scriptLimit + 1)],
			["script.ps1", new Uint8Array([255, 254, 0, 0])],
			["script.ps1", bytes("a\0b")]
		] as const)
			await expect(inspectScript(name, input)).rejects.toThrow()
	})

	it("keeps manual commands, blank desktop and unchanged UUIDs usable", async () => {
		const state = await createPrototypeState()
		state.draft.commands.launch.manual = ""
		expect(() => validateDraft(state)).not.toThrow()
		const next = saveSimulation(state, "success")
		expect(next.saved.uuid).toBe(state.saved.uuid)
		expect(next.saved.commands.launch.manual).toBe("")
		expect(state.saved.commands.launch.manual).toBe("example-launcher.exe")
	})

	it("applies a package only to the draft and removes its provisional resources on discard", async () => {
		const state = await createPrototypeState()
		state.draft.commands.launch.manual = "other manual draft"
		const next = applyPackage(state, await examplePackage())
		expect(next.saved).toEqual(state.saved)
		expect(next.draft.uuid).toBe(state.saved.uuid)
		expect(next.draft.commands.launch.manual).toBe("other manual draft")
		expect(next.resources.at(-1)?.provisional).toBe(true)
		expect(draftChanged(next)).toBe(true)
		const discarded = discardDraft(next)
		expect(discarded.resources).toEqual(state.resources)
		expect(discarded.draft).toEqual(state.saved)
	})

	it("keeps explicitly added library resources when discarding an application draft", async () => {
		const state = await createPrototypeState()
		const next = addScript(state, await inspectScript("Livre.ps1", bytes("# Somente leitura")))
		const discarded = discardDraft(applyPackage(next, await examplePackage()))
		expect(discarded.resources).toEqual(next.resources)
	})

	it("publishes only referenced provisional resources on simulated save", async () => {
		const state = applyPackage(await createPrototypeState(), await examplePackage())
		const next = saveSimulation(state, "success")
		expect(next.resources.at(-1)?.provisional).toBe(false)
		expect(next.saved).toEqual(next.draft)
		expect(draftChanged(next)).toBe(false)
	})

	it("does not switch any application or draft to a new revision automatically", async () => {
		const state = await createPrototypeState()
		const original = state.resources[0].revisions[0]
		const next = addScript(
			state,
			await inspectScript("Nova revisão.ps1", bytes("# Revisão 2")),
			"sample-script"
		)
		expect(next.resources[0].revisions.map((item) => item.number)).toEqual([1, 2])
		expect(next.resources[0].revisions[0]).toEqual(original)
		expect(next.other.commands.prepare.revision).toBe(1)
		expect(next.draft).toEqual(state.draft)
		expect(revisionFor(next.resources, next.other.commands.prepare)?.sha256).toBe(
			original.sha256
		)
	})

	it("rejects duplicate revisions without replacing the existing file", async () => {
		const state = await createPrototypeState()
		expect(() => addScript(state, state.resources[0].revisions[0], "sample-script")).toThrow(
			"já existe"
		)
		expect(state.resources[0].revisions).toHaveLength(1)
	})

	it("does not infer identity or overwrite a script from its display filename", async () => {
		const state = await createPrototypeState()
		const next = addScript(
			state,
			await inspectScript(state.resources[0].name, bytes("# Outro conteúdo"))
		)
		expect(next.resources).toHaveLength(2)
		expect(next.resources[1].id).not.toBe(next.resources[0].id)
		expect(next.resources[0]).toEqual(state.resources[0])
	})

	it("blocks deletion with either saved or unsaved references", async () => {
		const state = await createPrototypeState()
		expect(resourceUses(state, "sample-script")).toHaveLength(1)
		expect(() => removeResource(state, "sample-script")).toThrow("vínculos")
		const next = applyPackage(state, await examplePackage())
		expect(() => removeResource(next, next.draft.commands.prepare.resourceId)).toThrow(
			"rascunho"
		)
	})

	it("deletes an unused resource without changing applications or the source bytes", async () => {
		const state = await createPrototypeState()
		const file = await inspectScript("Livre.ps1", bytes("# Livre"))
		const next = addScript(state, file)
		const removed = removeResource(next, next.resources[1].id)
		expect(removed.resources).toEqual(state.resources)
		expect(removed.saved).toEqual(state.saved)
		expect(file.bytes).toEqual(bytes("# Livre"))
	})

	it("rejects unavailable revisions and literal argument line breaks before saving", async () => {
		const state = applyPackage(await createPrototypeState(), await examplePackage())
		state.draft.commands.prepare.revision = 999
		expect(() => saveSimulation(state, "success")).toThrow("revisão disponível")
		state.draft.commands.prepare.revision = 1
		state.draft.commands.prepare.args = ["value\nother"]
		expect(() => saveSimulation(state, "success")).toThrow("argumentos")
	})

	it("retains the draft and saved application when session or conflict rejects the save", async () => {
		for (const scenario of ["expired", "conflict"] as const) {
			const state = applyPackage(await createPrototypeState(), await examplePackage())
			const before = structuredClone(state)
			expect(() => saveSimulation(state, scenario)).toThrow()
			expect(state).toEqual(before)
		}
	})

	it("requires reconciliation after an applied but unconfirmed save rather than replaying it", async () => {
		const state = applyPackage(await createPrototypeState(), await examplePackage())
		const pending = saveSimulation(state, "unconfirmed")
		expect(pending.saved).toEqual(state.draft)
		expect(pending.version).not.toBe(pending.baseVersion)
		expect(() => saveSimulation(pending, "success")).toThrow("Conflito")
	})
})
