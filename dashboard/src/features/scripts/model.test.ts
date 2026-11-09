import { expect, it } from "vitest"
import { appDraft, validateApp } from "@/features/apps/model"
import { applicationScripts, readScriptFile, validateApplicationScripts } from "./model"

const reference = { id: "a".repeat(32), revision: "b".repeat(64), name: "example.ps1" }

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

it("preserves BOM and line endings exactly and rejects ambiguous PowerShell encodings", async () => {
	const bytes = Uint8Array.from([239, 187, 191, ...new TextEncoder().encode("# ação\r\n")])
	const file = await readScriptFile(new File([bytes], "example.ps1"))
	expect(Uint8Array.from(atob(file.data), (value) => value.charCodeAt(0))).toEqual(bytes)
	await expect(readScriptFile(new File(["# ação"], "example.ps1"))).rejects.toThrow("BOM")
	await expect(readScriptFile(new File(["# ok"], "example.cmd"))).rejects.toThrow()
	await expect(readScriptFile(new File(["a\0b"], "example.ps1"))).rejects.toThrow("nulos")
})
