import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("expired temporary code hides the QR and launch link without regeneration", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.clock.install()
	await page.goto("/pin")
	await page.getByRole("button", { name: "Vincular dispositivo", exact: true }).click()
	const dialog = page.getByRole("dialog")
	await dialog.getByRole("tab", { name: "Código temporário / QR", exact: true }).click()
	await dialog.getByLabel("Frase de pareamento", { exact: true }).fill("frase temporária")
	await dialog.getByRole("button", { name: "Gerar código temporário", exact: true }).click()
	await expect(
		dialog.getByRole("img", { name: "QR de pareamento do Artemis", exact: true })
	).toBeVisible()
	await page.clock.fastForward(181_000)
	await expect(dialog.getByText("Código expirado", { exact: true })).toBeVisible()
	await expect(
		dialog.getByRole("link", { name: "Abrir no Artemis", exact: true })
	).toHaveCount(0)
	await expect(
		dialog.getByRole("img", { name: "QR de pareamento do Artemis", exact: true })
	).toHaveCount(0)
	await expect(dialog.getByText("001234", { exact: true })).toHaveCount(0)
	expect(host.calls.filter((call) => call.path === "otp")).toHaveLength(1)
})

test("PIN validates four digits and refreshes the paired devices", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Vincular dispositivo", exact: true }).click()
	const dialog = page.getByRole("dialog")
	await dialog.getByLabel("Nome do dispositivo", { exact: true }).fill("Artemis ç")
	await dialog.getByLabel("PIN", { exact: true }).fill("12")
	await dialog.getByRole("button", { name: "Confirmar PIN", exact: true }).click()
	expect(host.calls.some((call) => call.path === "pin")).toBe(false)
	await dialog.getByLabel("PIN", { exact: true }).fill("0012")
	await dialog.getByRole("button", { name: "Confirmar PIN", exact: true }).click()
	await expect(dialog.getByRole("status")).toContainText("Dispositivo vinculado")
	expect(host.calls.filter((call) => call.path === "pin").map((call) => call.body)).toEqual([
		{ pin: "0012", name: "Artemis ç" }
	])
	expect(host.clients.some((client) => client.name === "Artemis ç")).toBe(true)
})

test("temporary code requires a phrase and invalidates the link when it changes", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Vincular dispositivo", exact: true }).click()
	const dialog = page.getByRole("dialog")
	await dialog.getByRole("tab", { name: "Código temporário / QR", exact: true }).click()
	const generate = dialog.getByRole("button", { name: "Gerar código temporário", exact: true })
	await expect(generate).toBeDisabled()
	await dialog.getByLabel("Frase de pareamento", { exact: true }).fill("frase ç")
	await generate.click()
	await expect(dialog.getByText("001234", { exact: true })).toBeVisible()
	await expect(
		dialog.getByRole("img", { name: "QR de pareamento do Artemis", exact: true })
	).toBeVisible()
	await expect(
		dialog.getByRole("link", { name: "Abrir no Artemis", exact: true })
	).toBeVisible()
	expect(host.calls.filter((call) => call.path === "otp")).toHaveLength(1)
	await dialog.getByLabel("Frase de pareamento", { exact: true }).fill("outra frase")
	await expect(
		dialog.getByRole("link", { name: "Abrir no Artemis", exact: true })
	).toHaveCount(0)
	await expect(
		dialog.getByRole("img", { name: "QR de pareamento do Artemis", exact: true })
	).toHaveCount(0)
	expect(host.calls.filter((call) => call.path === "otp")).toHaveLength(1)
})

test("rejected PIN does not create a device or clear the entered code", async ({ page }) => {
	const host = await mockHost(page)
	let writes = 0
	await page.route("**/api/pin", async (route) => {
		writes++
		await route.fulfill({ json: { status: false, error: "PIN recusado pelo cliente." } })
	})
	await page.goto("/pin")
	await page.getByRole("button", { name: "Vincular dispositivo", exact: true }).click()
	const dialog = page.getByRole("dialog")
	await dialog.getByLabel("PIN", { exact: true }).fill("0012")
	await dialog.getByRole("button", { name: "Confirmar PIN", exact: true }).click()
	await expect(dialog.getByText("PIN recusado pelo cliente.", { exact: true })).toBeVisible()
	await expect(dialog.getByLabel("PIN", { exact: true })).toHaveValue("0012")
	expect(host.clients).toHaveLength(1)
	expect(writes).toBe(1)
})
