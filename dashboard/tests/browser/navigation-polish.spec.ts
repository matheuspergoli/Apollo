import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("settings search accepts accents/case/multiple terms and clears accessibly", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	const search = page.getByRole("textbox", { name: "Buscar configurações", exact: true })
	await search.fill("saida")
	await expect(page.locator("#field-audio_sink")).toBeVisible()
	await search.fill("ÁUDIO   SAIDA")
	await expect(page.locator("#field-audio_sink")).toBeVisible()
	await search.fill("nvenc_preset")
	await expect(page.locator("#field-nvenc_preset")).toBeVisible()
	await page.getByRole("button", { name: "Limpar busca", exact: true }).click()
	await expect(search).toBeFocused()
	await expect(page.locator("#sunshine_name")).toBeVisible()
	await search.fill("saida")
	await search.press("Escape")
	await expect(search).toHaveValue("")
	await expect(
		page.getByRole("button", { name: "Baixar template da seção", exact: true })
	).toBeVisible()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("enabled switches have a pointer cursor and implied disabled permissions do not", async ({
	page
}) => {
	await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	const launch = page.getByRole("switch", { name: "Iniciar aplicativos", exact: true })
	expect(await launch.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer")
	await launch.click()
	const view = page.getByRole("switch", { name: "Visualizar stream", exact: true })
	await expect(view).toBeDisabled()
	expect(await view.evaluate((element) => getComputedStyle(element).cursor)).toBe(
		"not-allowed"
	)
})

for (const { width, theme } of [390, 768, 1920].flatMap((width) =>
	["light", "dark"].map((theme) => ({ width, theme }))
)) {
	test(`sidebar/header/footer align at ${width}px in ${theme}`, async ({ page }) => {
		await mockHost(page)
		await page.setViewportSize({ width, height: 900 })
		await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme)
		await page.goto("/")
		await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible()
		if (width < 768)
			await page.getByRole("button", { name: "Alternar navegação", exact: true }).click()
		const geometry = await page.evaluate(() => {
			const side = document.querySelector('[data-slot="sidebar-header"]')
			const main = document.querySelector('[data-slot="host-header"]')
			const footer = document.querySelector('[data-slot="sidebar-footer"]')
			const logo = side?.querySelector("a")
			const theme = main?.querySelector('[data-slot="select-trigger"]')
			if (!side || !main || !footer || !logo || !theme)
				throw new Error("Missing navigation geometry")
			const a = side.getBoundingClientRect(),
				b = main.getBoundingClientRect(),
				c = footer.getBoundingClientRect()
			const logoBox = logo.getBoundingClientRect(),
				themeBox = theme.getBoundingClientRect()
			return {
				sideHeight: a.height,
				mainHeight: b.height,
				footerHeight: c.height,
				bottomDifference: Math.abs(a.bottom - b.bottom),
				centerDifference: Math.abs(
					logoBox.y + logoBox.height / 2 - themeBox.y - themeBox.height / 2
				),
				footerPadding: getComputedStyle(footer).paddingLeft
			}
		})
		expect(geometry).toMatchObject({
			sideHeight: 64,
			mainHeight: 64,
			footerHeight: 64,
			footerPadding: "16px"
		})
		expect(geometry.bottomDifference).toBeLessThanOrEqual(0.5)
		expect(geometry.centerDifference).toBeLessThanOrEqual(0.5)
		await page.screenshot({ path: `/tmp/opencode/apollo-navigation-${width}-${theme}.png` })
	})
}
