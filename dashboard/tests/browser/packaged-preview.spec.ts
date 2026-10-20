import { expect, test } from "@playwright/test"

const host = "http://127.0.0.1:4175"
const path = `${host}/assets/apollo-preview/index.html`

test("packaged hash login stays in the preview and legacy settings remain a full navigation", async ({
	page
}) => {
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.route("**/api/login", (route) => route.fulfill({ status: 200 }))
	await page.route("**/api/config", (route) =>
		route.fulfill({ json: { status: true, sunshine_name: "Packaged mock host" } })
	)
	await page.goto(`${path}#/login`)
	await page.getByLabel("Usuário", { exact: true }).fill("Test")
	await page.getByLabel("Senha", { exact: true }).fill("Test-only-123")
	await page.getByRole("button", { name: "Entrar no painel", exact: true }).click()
	await expect(page).toHaveURL(`${path}#/`)
	await expect(page.getByText("Packaged mock host", { exact: true })).toBeVisible()
	await page.reload()
	await expect(page.getByText("Packaged mock host", { exact: true })).toBeVisible()
	await page.getByRole("link", { name: "Configurações · compatibilidade" }).click()
	await expect(page).toHaveURL(`${host}/config`)
	await expect(
		page.getByRole("heading", { name: "Compatibility config fixture" })
	).toBeVisible()
	expect(errors).toEqual([])
})

test("packaged setup/login deep links survive reload without backend rewrite rules", async ({
	page
}) => {
	for (const route of ["welcome", "login"]) {
		await page.goto(`${path}#/${route}`)
		await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible()
		await page.reload()
		await expect(page.getByLabel("Usuário", { exact: true })).toBeVisible()
	}
})
