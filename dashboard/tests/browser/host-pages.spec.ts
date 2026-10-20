import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

const host = "http://127.0.0.1:4175"
for (const [path, heading] of [
	["/", "Visão geral"],
	["/pin", "Dispositivos"],
	["/apps", "Aplicativos"],
	["/config", "Configurações"],
	["/password", "Acesso e senha"],
	["/troubleshooting", "Diagnóstico"],
	["/login", "Acesse seu host."],
	["/welcome", "Prepare seu host."]
]) {
	test(`host HTML entry ${path} opens and survives reload without a legacy UI`, async ({
		page
	}) => {
		await mockHost(page)
		const errors: string[] = []
		const resources: string[] = []
		page.on("pageerror", (error) => errors.push(error.message))
		page.on("request", (request) => resources.push(request.url()))
		await page.goto(host + path)
		await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
		await page.reload()
		await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
		expect(resources.some((url) => /bootstrap|\.vue|apollo-preview/.test(url))).toBe(false)
		expect(errors).toEqual([])
	})
}

test("file routes preserve settings search parameters and navigation through the sidebar", async ({
	page
}) => {
	await mockHost(page)
	await page.goto(`${host}/config?section=nv`)
	await expect(page.locator("#nvenc_preset")).toBeVisible()
	await page.getByRole("link", { name: "Dispositivos", exact: true }).click()
	await expect(page).toHaveURL(`${host}/pin`)
	await expect(page.getByRole("heading", { name: "Dispositivos", exact: true })).toBeVisible()
})
