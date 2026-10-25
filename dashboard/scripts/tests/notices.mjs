import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { dependencyNotices } from "../notices.mjs"

test("consolidates license text, deduplicates identical notices and never publishes install paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "apollo-notices-"))
	try {
		await writeFile(join(root, "LICENSE"), "Copyright Example\r\nPermission granted.\r\n")
		await writeFile(join(root, "secret.txt"), "not a license")
		const report = {
			MIT: [
				{ name: "a", versions: ["1.0.0"], paths: [root] },
				{ name: "b", versions: ["2.0.0"], paths: [root] }
			]
		}
		const result = await dependencyNotices(report, "Apollo notice")
		assert(result.includes("a@1.0.0") && result.includes("b@2.0.0"))
		assert.equal(result.split("Copyright Example").length, 2)
		assert(result.startsWith("Apollo notice"))
		assert(
			!result.includes(root) && !result.includes("not a license") && !result.includes("\r")
		)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("fails the build rather than dropping missing or empty license text", async () => {
	const root = await mkdtemp(join(tmpdir(), "apollo-notices-"))
	try {
		await mkdir(join(root, "LICENSE"))
		const report = { MIT: [{ name: "a", versions: ["1.0.0"], paths: [root] }] }
		await assert.rejects(dependencyNotices(report, "Apollo"), /Missing license/)
		await rm(join(root, "LICENSE"), { recursive: true })
		await writeFile(join(root, "LICENSE"), " ")
		await assert.rejects(dependencyNotices(report, "Apollo"), /Empty license/)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("rejects incomplete reports", async () => {
	for (const report of [null, [], {}, { MIT: "invalid" }, { MIT: [{}] }])
		await assert.rejects(dependencyNotices(report, "Apollo"))
})
