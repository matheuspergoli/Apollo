import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

for (const { width, theme } of [390, 1280].flatMap((width) =>
	["light", "dark"].map((theme) => ({ width, theme }))
)) {
	test(`pairing tabs and QR stay compact at ${width}px in ${theme}`, async ({ page }) => {
		await mockHost(page)
		await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme)
		await page.setViewportSize({ width, height: 844 })
		await page.goto("/pin")
		await expect(page.getByText("Referência do projeto", { exact: true })).toHaveCount(0)
		await page.getByRole("button", { name: "Vincular dispositivo", exact: true }).click()
		const dialog = page.getByRole("dialog")
		const list = dialog.getByRole("tablist")
		expect((await list.boundingBox())?.height).toBeLessThanOrEqual(48)
		await dialog.getByRole("tab", { name: "Código temporário / QR", exact: true }).click()
		await dialog.getByLabel("Frase de pareamento", { exact: true }).fill("teste de layout")
		await dialog.getByRole("button", { name: "Gerar código temporário", exact: true }).click()
		const qr = dialog.getByRole("img", { name: "QR de pareamento do Artemis", exact: true })
		await expect(qr).toBeVisible()
		expect((await list.boundingBox())?.height).toBeLessThanOrEqual(48)
		expect((await qr.boundingBox())?.width).toBeLessThanOrEqual(192)
		expect((await dialog.boundingBox())?.height).toBeLessThanOrEqual(844 * 0.9 + 2)
		const qrBox = await qr.boundingBox()
		const dialogBox = await dialog.boundingBox()
		if (!qrBox || !dialogBox) throw new Error("Missing pairing geometry")
		expect(qrBox.y + qrBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
		await page.screenshot({
			path: `/tmp/opencode/apollo-pairing-compact-${theme}-${width}.png`,
			fullPage: true
		})
	})
}
