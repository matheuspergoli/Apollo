import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("rejected restart closes its confirmation and requires reauthentication without replay", async ({
	page
}) => {
	const host = await mockHost(page)
	let attempts = 0
	await page.route("**/api/restart", async (route) => {
		attempts++
		host.authorized = false
		await route.fulfill({ status: 401 })
	})
	await page.goto("/")
	await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible()
	const restart = page.getByRole("button", { name: "Reiniciar host", exact: true })
	await restart.click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(page.getByRole("alertdialog")).toBeHidden()
	const notice = page.getByRole("status").filter({ hasText: "Sessão expirada" })
	await expect(notice).toBeVisible()
	await expect(restart).toBeDisabled()
	await notice.getByRole("button", { name: "Verificar sessão", exact: true }).click()
	await expect(notice).toContainText("ainda não foi renovada")
	expect(attempts).toBe(1)
	host.authorized = true
	await notice.getByRole("button", { name: "Verificar sessão", exact: true }).click()
	await expect(notice).toBeHidden()
	await expect(restart).toBeEnabled()
	expect(attempts).toBe(1)
})

test("session renewal preserves a draft and never repeats the rejected save", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Meu rascunho preservado")
	host.authorized = false
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	// The review remains editable after a failed save; dismiss it, not the draft.
	await page.getByRole("dialog").getByRole("button", { name: "Voltar", exact: true }).click()
	const notice = page.getByRole("status").filter({ hasText: "Sessão expirada" })
	await expect(notice).toBeVisible()
	host.authorized = true
	await notice.getByRole("button", { name: "Verificar sessão", exact: true }).click()
	await expect(notice).toBeHidden()
	await expect(page.locator("#sunshine_name")).toHaveValue("Meu rascunho preservado")
	await expect(
		page.getByRole("button", { name: "Reiniciar host", exact: true })
	).toBeDisabled()
	expect(host.config.sunshine_name).toBe("Test host")
	expect(host.calls.some((call) => call.path === "config" && call.method === "POST")).toBe(
		false
	)
})

test("overview and diagnostics use saved-configuration copy without lab placeholders", async ({
	page
}) => {
	await mockHost(page)
	await page.goto("/")
	await expect(page.getByText("Configurações salvas", { exact: true })).toBeVisible()
	await expect(page.getByText("Estado de inicialização", { exact: true })).toBeVisible()
	for (const text of [
		"não FPS",
		"não estado efetivo",
		"sem inferência",
		"Configuração declarada"
	])
		await expect(page.getByText(text, { exact: false })).toHaveCount(0)
	await page.goto("/troubleshooting")
	await expect(page.getByText("Informações do host", { exact: true })).toBeVisible()
	await expect(page.getByText("Captura configurada:", { exact: false })).toBeVisible()
	await page.goto("/welcome")
	await expect(page.getByText("Laboratório", { exact: true })).toHaveCount(0)
	await expect(page.getByRole("contentinfo")).toHaveCount(0)
})

for (const width of [320, 390, 640, 1280]) {
	test(`Artemis launch dialog fits ${width}px with no horizontal overflow`, async ({
		page
	}) => {
		await mockHost(page)
		await page.setViewportSize({ width, height: 620 })
		await page.goto("/apps")
		await page.getByRole("button", { name: "Abrir no Artemis", exact: true }).click()
		const dialog = page.getByRole("dialog", { name: "Continuar no Artemis", exact: true })
		await expect(
			dialog.getByRole("img", { name: "QR para abrir aplicativo no Artemis", exact: true })
		).toBeVisible()
		expect(
			await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true)
		const footer = dialog.locator('[data-slot="dialog-footer"]')
		expect(
			await footer.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true)
		await dialog
			.getByRole("link", { name: "Abrir Artemis neste dispositivo", exact: true })
			.scrollIntoViewIfNeeded()
		expect(
			await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
		await page.screenshot({ path: `/tmp/opencode/apollo-artemis-no-overflow-${width}.png` })
	})
}
