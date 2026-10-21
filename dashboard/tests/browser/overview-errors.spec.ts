import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("partial overview failure shows unavailable counts and recovers only on refresh", async ({
	page
}) => {
	await mockHost(page)
	let fail = true
	await page.route("**/api/clients/list", async (route) => {
		if (fail) return route.fulfill({ status: 503 })
		return route.fallback()
	})
	await page.goto("/")
	await expect(page.getByRole("alert")).toContainText("503")
	const clients = page
		.locator('[data-slot="card"]')
		.filter({ has: page.getByText("Dispositivos", { exact: true }) })
	await expect(clients).toContainText("—")
	fail = false
	await page.getByRole("button", { name: "Atualizar leitura", exact: true }).click()
	await expect(page.getByRole("alert")).toHaveCount(0)
	await expect(clients.locator('[data-slot="card-title"]')).toHaveText("1")
})
