import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

for (const scenario of [
	{ route: "/", width: 1280, theme: "light" },
	{ route: "/apps", width: 390, theme: "dark" },
	{ route: "/config?section=network", width: 390, theme: "light" },
	{ route: "/pin", width: 1280, theme: "dark" }
] as const) {
	test(`skip navigation moves keyboard focus into content: ${scenario.route}, ${scenario.width}px, ${scenario.theme}`, async ({
		page
	}) => {
		const host = await mockHost(page)
		await page.setViewportSize({ width: scenario.width, height: 844 })
		await page.addInitScript((theme) => localStorage.setItem("theme", theme), scenario.theme)
		await page.goto(scenario.route)
		const skip = page.getByRole("link", { name: "Pular para o conteúdo", exact: true })
		await expect(skip).toBeAttached()
		await expect(skip).not.toBeInViewport()
		await page.keyboard.press("Tab")
		await expect(skip).toBeFocused()
		await expect(skip).toBeInViewport()
		await page.keyboard.press("Enter")
		const content = page.locator("#main-content")
		await expect(content).toBeFocused()
		await expect(skip).not.toBeInViewport()
		const url = new URL(page.url())
		const original = new URL(scenario.route, url.origin)
		expect(url.pathname).toBe(original.pathname)
		expect(url.search).toBe(original.search)
		await page.keyboard.press("Tab")
		await expect
			.poll(() => content.evaluate((element) => element.contains(document.activeElement)))
			.toBe(true)
		expect(host.calls.some((call) => call.method === "POST")).toBe(false)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
	})
}

test("skipping navigation preserves an unsaved settings draft", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/config?section=network")
	const port = page.locator("#port")
	await port.fill("50989")
	const skip = page.getByRole("link", { name: "Pular para o conteúdo", exact: true })
	await skip.focus()
	await page.keyboard.press("Enter")
	await expect(page.locator("#main-content")).toBeFocused()
	await expect(port).toHaveValue("50989")
	await expect(page.getByRole("alertdialog")).toHaveCount(0)
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})
