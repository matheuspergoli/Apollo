import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("pairing dialog closes by Escape and restores focus without writes", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	const trigger = page.getByRole("button", { name: "Vincular dispositivo", exact: true })
	await trigger.focus()
	await page.keyboard.press("Enter")
	await expect(page.getByRole("dialog")).toBeVisible()
	await page.keyboard.press("Escape")
	await expect(page.getByRole("dialog")).toBeHidden()
	await expect(trigger).toBeFocused()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("mobile navigation is labeled in Portuguese and keyboard focus returns on close", async ({
	page
}) => {
	await mockHost(page)
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto("/")
	const trigger = page.getByRole("button", { name: "Alternar navegação", exact: true })
	await trigger.focus()
	await page.keyboard.press("Enter")
	const navigation = page.getByRole("dialog", { name: "Navegação", exact: true })
	await expect(navigation).toBeVisible()
	await expect(
		navigation.getByRole("link", { name: "Dispositivos", exact: true })
	).toBeVisible()
	await page.keyboard.press("Escape")
	await expect(navigation).toBeHidden()
	await expect(trigger).toBeFocused()
})
