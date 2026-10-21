import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

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
	await expect(page.getByRole("status")).toContainText("Isso não confirma")
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
