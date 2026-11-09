import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("script uploads stay in the app draft until explicit save review", async ({ page }) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	await page.goto("/apps")
	await page.getByRole("button", { name: "Novo aplicativo", exact: true }).click()
	await page.getByLabel("Nome", { exact: true }).fill("Script application")
	await page.getByRole("button", { name: "Usar script", exact: true }).click()
	const picker = page.getByRole("dialog", { name: "Escolher script" })
	await picker.getByLabel("Adicionar script deste dispositivo").setInputFiles({
		name: "example.ps1",
		mimeType: "text/plain",
		buffer: Buffer.from("# Test-owned content\r\n")
	})
	const selected = page.getByRole("dialog", { name: "Usar este script?", exact: true })
	await expect(selected.getByLabel("Conteúdo do script")).toHaveValue("# Test-owned content\n")
	await selected.getByRole("button", { name: "Usar script", exact: true }).click()
	await page.getByRole("button", { name: "Adicionar argumento", exact: true }).click()
	await page
		.getByRole("textbox", { name: "Argumento 1 de inicialização", exact: true })
		.fill("literal with spaces")
	expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	const review = page.getByRole("dialog", { name: "Salvar vínculos de scripts?" })
	await expect(review).toBeVisible()
	expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	await review.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	const saved = host.calls.find((call) => call.method === "POST" && call.path === "apps")?.body
	expect(saved?.["scripts-approved"]).toBe(true)
	expect(saved?.["cmd-script"]).toEqual({
		file: {
			name: "example.ps1",
			data: Buffer.from("# Test-owned content\r\n").toString("base64")
		},
		arguments: ["literal with spaces"]
	})
})

test("invalid saved references remain editable and can return to manual commands", async ({
	page
}) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	host.apps[0]["cmd-script"] = { id: "broken" }
	host.apps[0].cmd = ""
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await expect(
		page.getByText("A referência existente é inválida.", { exact: false })
	).toBeVisible()
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Usar comando manual", exact: true }).click()
	await page.getByLabel("Comando de inicialização", { exact: true }).fill("manual-command")
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(host.apps[0].cmd).toBe("manual-command")
	expect(host.apps[0]).not.toHaveProperty("cmd-script")
})

for (const theme of ["light", "dark"])
	test(`script library fits mobile and closes by keyboard in ${theme}`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.addInitScript((value) => localStorage.setItem("theme", value), theme)
		const host = await mockHost(page)
		host.scriptsSupported = true
		await page.goto("/apps")
		await page.getByRole("button", { name: "Scripts", exact: true }).click()
		const dialog = page.getByRole("dialog", { name: "Scripts", exact: true })
		await expect(dialog.getByText("Nenhum script salvo.", { exact: false })).toBeVisible()
		expect(
			await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true)
		await page.keyboard.press("Escape")
		await expect(dialog).not.toBeVisible()
		expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	})
