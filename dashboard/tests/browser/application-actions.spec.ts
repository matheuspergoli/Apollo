import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("canceling a changed application asks before discarding its draft", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-name").fill("Rascunho")
	await page.getByRole("button", { name: "Cancelar edição", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Cancelar", exact: true })
		.click()
	await expect(page.locator("#app-name")).toHaveValue("Rascunho")
	await page.getByRole("button", { name: "Cancelar edição", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible()
	expect(host.apps[0]?.name).toBe("Test Game")
	expect(host.calls.some((call) => call.path === "apps" && call.method === "POST")).toBe(false)
})

test("ordering is staged until explicitly saved", async ({ page }) => {
	const host = await mockHost(page)
	host.apps.push({
		uuid: "app-2",
		name: "Segundo jogo",
		cmd: "second",
		"prep-cmd": [],
		"state-cmd": [],
		detached: []
	})
	await page.goto("/apps")
	await page.getByRole("button", { name: "Descer Test Game", exact: true }).click()
	expect(host.apps.map((app) => app.uuid)).toEqual(["app-1", "app-2"])
	expect(host.calls.some((call) => call.path === "apps/reorder")).toBe(false)
	await page.getByRole("button", { name: "Salvar ordem", exact: true }).click()
	await expect(page.getByRole("button", { name: "Salvar ordem", exact: true })).toHaveCount(0)
	expect(host.apps.map((app) => app.uuid)).toEqual(["app-2", "app-1"])
	expect(
		host.calls.filter((call) => call.path === "apps/reorder").map((call) => call.body)
	).toEqual([{ order: ["app-2", "app-1"] }])
})

test("application deletion requires confirmation and removes only its library entry", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Excluir Test Game", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Cancelar", exact: true })
		.click()
	expect(host.apps).toHaveLength(1)
	expect(host.calls.some((call) => call.path === "apps/delete")).toBe(false)
	await page.getByRole("button", { name: "Excluir Test Game", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(
		page.getByRole("button", { name: "Excluir Test Game", exact: true })
	).toHaveCount(0)
	expect(host.apps).toHaveLength(0)
	expect(
		host.calls.filter((call) => call.path === "apps/delete").map((call) => call.body)
	).toEqual([{ uuid: "app-1" }])
})

test("editing preserves unknown application fields without launching", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-name").fill("Jogo ç")
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible()
	expect(host.apps[0]).toMatchObject({
		uuid: "app-1",
		name: "Jogo ç",
		custom_app_flag: "keep",
		cmd: "start-test"
	})
	expect(
		host.calls.filter((call) => call.path === "apps" && call.method === "POST")
	).toHaveLength(1)
	expect(host.calls.some((call) => call.path === "apps/launch")).toBe(false)
})

test("launch and stop require separate confirmations", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Iniciar no host", exact: true }).click()
	expect(host.current).toBe("")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(page.getByRole("button", { name: "Encerrar", exact: true })).toBeVisible()
	expect(
		host.calls.filter((call) => call.path === "apps/launch").map((call) => call.body)
	).toEqual([{ uuid: "app-1" }])
	await page.getByRole("button", { name: "Encerrar", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Cancelar", exact: true })
		.click()
	expect(host.current).toBe("app-1")
	expect(host.calls.some((call) => call.path === "apps/close")).toBe(false)
	await page.getByRole("button", { name: "Encerrar", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(
		page.getByRole("button", { name: "Iniciar no host", exact: true })
	).toBeVisible()
	expect(host.current).toBe("")
})

test("rejected save retains the application draft without retrying", async ({ page }) => {
	const host = await mockHost(page)
	let writes = 0
	await page.route("**/api/apps", async (route) => {
		if (route.request().method() !== "POST") return route.fallback()
		writes++
		return route.fulfill({
			json: { status: false, error: "Arquivo indisponível para gravação." }
		})
	})
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-name").fill("Rascunho preservado")
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(
		page.getByText("Arquivo indisponível para gravação.", { exact: true })
	).toBeVisible()
	await expect(page.locator("#app-name")).toHaveValue("Rascunho preservado")
	await expect(
		page.getByRole("button", { name: "Salvar aplicativo", exact: true })
	).toBeEnabled()
	expect(writes).toBe(1)
	expect(host.apps[0]?.name).toBe("Test Game")
})
