import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("host information refresh displays fresh values, loading, errors and recovery without writes", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/troubleshooting")
	const card = page.locator('[data-slot="card"]').filter({ hasText: "Informações do host" })
	await expect(card.getByRole("status")).toContainText("Informações atualizadas às")
	let release: (() => void) | undefined
	await page.route("**/api/config", async (route) => {
		await new Promise<void>((resolve) => {
			release = resolve
		})
		await route.fulfill({
			json: { ...host.config, status: true, version: "1.0.0", vdisplayStatus: 0 }
		})
	})
	host.config.version = "1.0.0"
	host.config.capture = "wgc"
	await card
		.getByRole("button", { name: "Atualizar informações do host", exact: true })
		.click()
	await expect(card.getByRole("button", { name: "Atualizando…", exact: true })).toBeDisabled()
	await expect(card.getByRole("status")).toContainText("Atualizando informações")
	await expect.poll(() => Boolean(release)).toBe(true)
	release?.()
	await expect(card).toContainText("1.0.0")
	await expect(card).toContainText("Captura configurada: wgc")
	await page.unroute("**/api/config")
	await page.route("**/api/config", (route) => route.fulfill({ status: 503 }))
	await card
		.getByRole("button", { name: "Atualizar informações do host", exact: true })
		.click()
	await expect(card.getByRole("alert")).toContainText("503")
	await expect(card.getByRole("status")).toContainText("podem estar desatualizados")
	await page.unroute("**/api/config")
	await card
		.getByRole("button", { name: "Atualizar informações do host", exact: true })
		.click()
	await expect(card.getByRole("alert")).toHaveCount(0)
	await expect(card.getByRole("status")).toContainText("Informações atualizadas às")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("failed log reads can be explicitly refreshed without recovery writes", async ({
	page
}) => {
	const host = await mockHost(page)
	let fail = true
	await page.route("**/api/logs", async (route) => {
		if (fail) return route.fulfill({ status: 503 })
		return route.fallback()
	})
	await page.goto("/troubleshooting")
	await expect(page.getByRole("alert")).toContainText("503")
	fail = false
	await page.getByRole("button", { name: "Atualizar log", exact: true }).click()
	await expect(
		page.getByRole("region", { name: "Conteúdo do log", exact: true })
	).toContainText("test warning")
	await expect(page.getByRole("alert")).toHaveCount(0)
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("denied clipboard access shows an error instead of claiming a copy", async ({ page }) => {
	await mockHost(page)
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: {
				writeText: async () => {
					throw new DOMException("denied", "NotAllowedError")
				}
			}
		})
	})
	await page.goto("/troubleshooting")
	await page.getByRole("button", { name: "Copiar trecho", exact: true }).click()
	await expect(page.getByRole("alert")).toContainText("Não foi possível copiar o trecho.")
	await expect(page.getByText("Trecho visível copiado.", { exact: false })).toHaveCount(0)
})

test("recovery requires confirmation and cancellation sends nothing", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/troubleshooting")
	await page
		.getByRole("button", { name: "Restaurar persistência de display", exact: true })
		.click()
	const dialog = page.getByRole("alertdialog")
	await expect(dialog).toBeVisible()
	await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
	expect(
		host.calls.filter((call) => call.path === "reset-display-device-persistence")
	).toHaveLength(0)
	await page
		.getByRole("button", { name: "Restaurar persistência de display", exact: true })
		.click()
	await dialog.getByRole("button", { name: "Confirmar", exact: true }).click()
	await expect(dialog).toBeHidden()
	expect(
		host.calls.filter((call) => call.path === "reset-display-device-persistence")
	).toHaveLength(1)
})

test("lost restart response is not reported as success or retried", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/troubleshooting")
	await page.getByRole("button", { name: "Reiniciar Apollo", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(
		page.getByRole("status").filter({ hasText: "Verifique o estado do host" })
	).toContainText("Isso não confirma")
	expect(host.calls.filter((call) => call.path === "restart")).toHaveLength(1)
})

test("logs remain text and level filters do not alter the download", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/troubleshooting")
	const log = page.getByRole("region", { name: "Conteúdo do log" })
	await expect(log).toContainText("<script>window.injected=true</script>")
	expect(await page.evaluate(() => Object.hasOwn(window, "injected"))).toBe(false)
	await page.getByRole("combobox", { name: "Filtrar nível" }).click()
	await page.getByRole("option", { name: "Avisos", exact: true }).click()
	await expect(log).toContainText("test warning")
	await expect(log).not.toContainText("<script>")
	await page.getByRole("button", { name: "Baixar log completo", exact: true }).click()
	const downloadReady = page.waitForEvent("download")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	const download = await downloadReady
	expect(download.suggestedFilename()).toBe("apollo-log.txt")
	const stream = await download.createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	expect(Buffer.concat(chunks).toString("utf8")).toBe(host.logs)
})
