import { expect, type Locator, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

async function inputOffset(input: Locator) {
	return input.evaluate(async (element) => {
		await document.fonts.ready
		const dialog = element.closest('[role="dialog"]')
		if (!dialog) throw new Error("Missing pairing dialog")
		await Promise.all(
			dialog.getAnimations().map((animation) => animation.finished.catch(() => undefined))
		)
		const panel = element.closest('[role="tabpanel"]')
		if (!panel) throw new Error("Missing pairing panel")
		// Read both rectangles in the same browser task. The centered dialog can
		// move while inactive panels are being removed during the tab transition.
		return element.getBoundingClientRect().top - panel.getBoundingClientRect().top
	})
}

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
		const pinOffset = await inputOffset(dialog.getByLabel("PIN", { exact: true }))
		expect((await list.boundingBox())?.height).toBeLessThanOrEqual(48)
		await dialog.getByRole("tab", { name: "Código temporário / QR", exact: true }).click()
		const otpOffset = await inputOffset(
			dialog.getByLabel("Frase de pareamento", { exact: true })
		)
		expect(Math.abs(pinOffset - otpOffset)).toBeLessThanOrEqual(1)
		await dialog.getByRole("tab", { name: "PIN do cliente", exact: true }).click()
		expect(
			Math.abs((await inputOffset(dialog.getByLabel("PIN", { exact: true }))) - otpOffset)
		).toBeLessThanOrEqual(1)
		await dialog.getByRole("tab", { name: "Código temporário / QR", exact: true }).click()
		await dialog.getByLabel("Frase de pareamento", { exact: true }).fill("teste de layout")
		await dialog.getByRole("button", { name: "Gerar código temporário", exact: true }).click()
		const qr = dialog.getByRole("img", { name: "QR de pareamento do Artemis", exact: true })
		await expect(qr).toBeVisible()
		expect((await list.boundingBox())?.height).toBeLessThanOrEqual(48)
		expect((await qr.boundingBox())?.width).toBeLessThanOrEqual(192)
		expect((await dialog.boundingBox())?.height).toBeLessThanOrEqual(844 * 0.9 + 2)
		const qrFits = await qr.evaluate((image) => {
			const container = image.closest('[role="dialog"]')
			if (!container) throw new Error("Missing pairing dialog")
			return image.getBoundingClientRect().bottom <= container.getBoundingClientRect().bottom
		})
		expect(qrFits).toBe(true)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
		await page.screenshot({
			path: `/tmp/opencode/apollo-pairing-compact-${theme}-${width}.png`,
			fullPage: true
		})
	})
}
