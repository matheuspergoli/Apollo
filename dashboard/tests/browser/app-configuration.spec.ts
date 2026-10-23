import { type Download, expect, test } from "@playwright/test"
import { strFromU8, unzipSync } from "fflate"
import { mockHost } from "../fixtures/mock-api"

function file(application: Record<string, unknown>) {
	return {
		name: "aplicativo.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-application",
				version: 1,
				kind: "application",
				application
			})
		)
	}
}
async function contents(download: Download) {
	const stream = await download.createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	return unzipSync(Buffer.concat(chunks))
}

test("new application imports atomically, cancels safely and creates a fresh identity only on save", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Novo aplicativo", exact: true }).click()
	const input = page.getByLabel("Arquivo JSON do aplicativo", { exact: true })
	const payload = file({ name: "Importado ç", cmd: "do-not-run", "virtual-display": true })
	await input.setInputFiles(payload)
	const review = page.getByRole("dialog", {
		name: "Revisar importação de aplicativo",
		exact: true
	})
	await review.getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(page.locator("#app-name")).toHaveValue("")
	await input.setInputFiles(payload)
	await review.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click()
	await expect(page.locator("#app-name")).toHaveValue("Importado ç")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(host.apps).toHaveLength(2)
	const created = host.apps.find((app) => app.name === "Importado ç")
	expect(created?.uuid).not.toBe("app-1")
	expect(created?.cmd).toBe("do-not-run")
	expect(host.calls.some((call) => call.path === "apps/launch")).toBe(false)
})

test("partial application import preserves local UUID, unknown fields and other unsaved edits", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-cmd").fill("rascunho local")
	await page
		.getByLabel("Arquivo JSON do aplicativo", { exact: true })
		.setInputFiles(file({ name: "Renomeado via JSON" }))
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Aplicar ao rascunho", exact: true })
		.click()
	await expect(page.locator("#app-cmd")).toHaveValue("rascunho local")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible()
	expect(host.apps).toHaveLength(1)
	expect(host.apps[0]).toMatchObject({
		uuid: "app-1",
		name: "Renomeado via JSON",
		cmd: "rascunho local",
		custom_app_flag: "keep"
	})
})

test("identity-changing or incorrectly typed imports never alter the editor or call the API", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	const input = page.getByLabel("Arquivo JSON do aplicativo", { exact: true })
	for (const patch of [{ uuid: "different" }, { elevated: "false" }, { "prep-cmd": [null] }]) {
		await input.setInputFiles(file({ name: "Não aplicar", ...patch }))
		await expect(page.getByRole("alert")).toBeVisible()
		await expect(page.getByRole("dialog")).toHaveCount(0)
		await expect(page.locator("#app-name")).toHaveValue("Test Game")
	}
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("app export is confirmed, includes the draft and schema, and excludes identity", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-cmd").fill("comando do rascunho")
	await page
		.getByRole("button", { name: "Exportar aplicativo do editor", exact: true })
		.click()
	const ready = page.waitForEvent("download")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	const files = await contents(await ready)
	const data = JSON.parse(strFromU8(files["apollo-aplicativo/aplicativo.json"]))
	expect(data.application.cmd).toBe("comando do rascunho")
	expect(data.application).not.toHaveProperty("uuid")
	expect(data.application).not.toHaveProperty("custom_app_flag")
	expect(files["apollo-aplicativo/schema.json"]).toBeDefined()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})
