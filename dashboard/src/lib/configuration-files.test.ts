import { strFromU8, unzipSync } from "fflate"
import { expect, it } from "vitest"
import { z } from "zod"
import {
	configurationArchive,
	parseContract,
	readConfigurationJson
} from "./configuration-files"

it("reads UTF-8 JSON with optional BOM and applies limits to bytes, not characters", () => {
	expect(readConfigurationJson('\uFEFF{"nome":"áudio"}', 100)).toEqual({ nome: "áudio" })
	expect(() => readConfigurationJson(JSON.stringify({ nome: "á".repeat(40) }), 64)).toThrow(
		"0.0625 KiB"
	)
})

it("rejects malformed roots, unsafe keys, NUL and excessive depth", () => {
	for (const value of [
		"broken",
		"null",
		"[]",
		'{"__proto__":{}}',
		'{"a":{"constructor":{}}}',
		JSON.stringify({ cmd: "echo\0test" }),
		JSON.stringify({ ["x".repeat(129)]: 1 })
	])
		expect(() => readConfigurationJson(value, 1024)).toThrow()
	let nested: unknown = {}
	for (let index = 0; index < 25; index++) nested = { nested }
	expect(() => readConfigurationJson(JSON.stringify(nested), 4096)).toThrow("níveis")
})

it("reports contract errors in Portuguese without leaking input values", () => {
	const schema = z.strictObject({ flag: z.boolean() })
	expect(() => parseContract(schema, { flag: "secret-value" }, "Arquivo inválido")).toThrow(
		"flag: tipo incorreto"
	)
	try {
		parseContract(schema, { flag: "secret-value" }, "Arquivo inválido")
	} catch (error) {
		expect(String(error)).not.toContain("secret-value")
	}
	expect(() => parseContract(schema, { flag: true, extra: 1 }, "Arquivo inválido")).toThrow(
		"chaves não permitidas"
	)
})

it("builds Unicode document contents but rejects unsafe archive filenames", async () => {
	const archive = await configurationArchive("apollo-teste", {
		"LEIA-ME.md": "Configuração e áudio"
	})
	expect(
		strFromU8(
			unzipSync(new Uint8Array(await archive.arrayBuffer()))["apollo-teste/LEIA-ME.md"]
		)
	).toBe("Configuração e áudio")
	for (const name of ["../x", "/x", "a/../../x", "C:\\x", "a//x", "a/./x"])
		await expect(configurationArchive("apollo-teste", { [name]: "bad" })).rejects.toThrow()
})
