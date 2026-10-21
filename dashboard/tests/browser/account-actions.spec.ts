import { expect, type Page, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

async function fillCredentials(page: Page) {
	await page.getByLabel("Usuário atual", { exact: true }).fill("usuário ç")
	await page.getByLabel("Senha atual", { exact: true }).fill("senha atual")
	await page.getByLabel("Nova senha", { exact: true }).fill("nova senha ç")
	await page.getByLabel("Confirmar nova senha", { exact: true }).fill("nova senha ç")
}

test("mismatched passwords never reach the host", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/password")
	await fillCredentials(page)
	await page.getByLabel("Confirmar nova senha", { exact: true }).fill("diferente")
	await page.getByRole("button", { name: "Alterar acesso", exact: true }).click()
	await expect(page.getByText("As novas senhas não coincidem.")).toBeVisible()
	expect(host.calls.filter((call) => call.path === "password")).toHaveLength(0)
})

test("successful account change clears credentials and requests a fresh login", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/password")
	await fillCredentials(page)
	await page.getByRole("button", { name: "Alterar acesso", exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Acesso atualizado")
	await expect(page.getByLabel("Senha atual", { exact: true })).toHaveValue("")
	await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue("")
	await expect(
		page.getByRole("button", { name: "Alterar acesso", exact: true })
	).toBeDisabled()
	const writes = host.calls.filter((call) => call.path === "password")
	expect(writes).toHaveLength(1)
	expect(writes[0]?.body).toEqual({
		currentUsername: "usuário ç",
		currentPassword: "senha atual",
		newUsername: "",
		newPassword: "nova senha ç",
		confirmNewPassword: "nova senha ç"
	})
	await page.getByRole("link", { name: "Entrar novamente", exact: true }).click()
	await expect(page).toHaveURL(/\/login$/)
})

test("rejected account changes retain the form without reporting success", async ({
	page
}) => {
	await mockHost(page)
	let writes = 0
	await page.route("**/api/password", async (route) => {
		writes++
		await route.fulfill({ json: { status: false, error: "Credenciais atuais inválidas." } })
	})
	await page.goto("/password")
	await fillCredentials(page)
	await page.getByRole("button", { name: "Alterar acesso", exact: true }).click()
	await expect(page.getByText("Credenciais atuais inválidas.", { exact: true })).toBeVisible()
	await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue("nova senha ç")
	await expect(page.getByRole("button", { name: "Alterar acesso", exact: true })).toBeEnabled()
	await expect(page.getByText("Acesso atualizado", { exact: true })).toHaveCount(0)
	expect(writes).toBe(1)
})
