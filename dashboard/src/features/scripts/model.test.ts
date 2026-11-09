import { expect, it } from "vitest"
import { appDraft, validateApp } from "@/features/apps/model"
import {
	applicationScripts,
	readScriptFile,
	requiresScriptApproval,
	validateApplicationScripts
} from "./model"

const reference = { id: "a".repeat(32), revision: "b".repeat(64), name: "example.ps1" }

it("reviews only new or changed execution bindings, not names or display metadata", () => {
	const original = appDraft({
		name: "Example",
		detached: [{ cmd: "", "cmd-script": reference }]
	})
	expect(requiresScriptApproval(original, original)).toBe(false)
	expect(requiresScriptApproval({ ...original, name: "Renamed" }, original)).toBe(false)
	expect(
		requiresScriptApproval(
			{
				...original,
				detached: [
					{
						cmd: "",
						"cmd-script": { ...reference, name: "Metadata", number: 2, arguments: [] }
					}
				]
			},
			original
		)
	).toBe(false)
	for (const patch of [
		{ elevated: true },
		{ "working-dir": "C:\\Example" },
		{ detached: [{ cmd: "", "cmd-script": { ...reference, "execution-policy": "bypass" } }] },
		{ detached: [{ cmd: "", "cmd-script": { ...reference, arguments: ["changed"] } }] },
		{ detached: [{ cmd: "", "cmd-script": { ...reference, revision: "c".repeat(64) } }] },
		{ detached: ["manual", ...(original.detached as unknown[])] }
	])
		expect(requiresScriptApproval({ ...original, ...patch }, original)).toBe(true)
	expect(requiresScriptApproval({ ...original, detached: [] }, original)).toBe(false)
	expect(requiresScriptApproval(original, {})).toBe(true)
})

it("keeps managed bindings in each supported command slot and preserves unknown app data", () => {
	const app = appDraft({
		name: "Example",
		custom: "keep",
		"cmd-script": reference,
		"prep-cmd": [{ do: "", undo: "", "do-script": reference, "undo-script": reference }],
		"state-cmd": [{ do: "", "do-script": reference }]
	})
	expect(applicationScripts(app).map(({ label }) => label)).toEqual([
		"Inicialização",
		"Preparação, etapa 1: executar",
		"Preparação, etapa 1: desfazer",
		"Sessão, etapa 1: executar"
	])
	expect(validateApp(app).custom).toBe("keep")
})

it("allows empty arguments while drafting but rejects invalid final arguments and mixed commands", () => {
	for (const argument of ["", 'a"b', "a\nb", "a\0b", "é".repeat(513)]) {
		expect(() =>
			validateApplicationScripts({ "cmd-script": { ...reference, arguments: [argument] } })
		).toThrow()
	}
	expect(() =>
		validateApplicationScripts({ cmd: "manual", "cmd-script": reference })
	).toThrow()
	expect(
		validateApplicationScripts({
			"cmd-script": { ...reference, arguments: ["$literal; & text", "C:\\Example Folder\\"] }
		})
	).toHaveLength(1)
})

it("does not quietly ignore invalid references", () => {
	for (const value of [
		null,
		{},
		{ ...reference, revision: "missing" },
		{ ...reference, path: "C:\\example.ps1" }
	])
		expect(() => validateApplicationScripts({ "cmd-script": value })).toThrow()
})

it("preserves ordered manual and managed detached commands without changing the main executable", () => {
	const detached = [
		"first manual",
		{ cmd: "", "cmd-script": { ...reference, arguments: ["literal"] } },
		"last manual"
	]
	const app = appDraft({
		name: "Example",
		cmd: "C:\\Example\\launcher.exe",
		elevated: true,
		detached
	})
	expect(validateApp(app).detached).toEqual(detached)
	expect(validateApp(app).cmd).toBe("C:\\Example\\launcher.exe")
	expect(applicationScripts(app).map(({ label }) => label)).toEqual(["Desanexado, comando 2"])
	for (const command of [
		null,
		42,
		{},
		{ cmd: "manual", "cmd-script": reference },
		{ cmd: "", "cmd-script": reference, elevated: true }
	])
		expect(() => validateApp(appDraft({ name: "Example", detached: [command] }))).toThrow()
})

it("preserves BOM and line endings exactly and rejects ambiguous PowerShell encodings", async () => {
	const bytes = Uint8Array.from([239, 187, 191, ...new TextEncoder().encode("# ação\r\n")])
	const file = await readScriptFile(new File([bytes], "example.ps1"))
	expect(Uint8Array.from(atob(file.data), (value) => value.charCodeAt(0))).toEqual(bytes)
	await expect(readScriptFile(new File(["# ação"], "example.ps1"))).rejects.toThrow("BOM")
	await expect(readScriptFile(new File(["# ok"], "example.cmd"))).rejects.toThrow()
	await expect(readScriptFile(new File(["a\0b"], "example.ps1"))).rejects.toThrow("nulos")
})
