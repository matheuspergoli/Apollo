import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

for (const width of [390, 1280]) {
	test(`host pages and editors fit ${width}px without runtime errors`, async ({ page }) => {
		await mockHost(page)
		await page.setViewportSize({ width, height: 844 })
		const errors: string[] = []
		page.on("pageerror", (error) => errors.push(error.message))
		for (const path of ["/", "/pin", "/apps", "/config", "/password", "/troubleshooting"]) {
			await page.goto(path)
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
			await expect
				.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
				.toBe(true)
			await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
		}
		await page.goto("/apps")
		await page.getByRole("button", { name: "Editar", exact: true }).click()
		await expect(page.locator("#app-name")).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
		await page.goto("/pin")
		await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
		await expect(page.getByLabel("Nome", { exact: true })).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
		expect(errors).toEqual([])
	})
}
