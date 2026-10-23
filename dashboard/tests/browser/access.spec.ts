import { expect, test } from "@playwright/test"

test("setup validates, accepts Enter and automatically continues to login with feedback", async ({
	page
}) => {
	let posts = 0
	await page.route("**/api/password", (route) => {
		posts++
		return route.fulfill({ json: { status: true } })
	})
	await page.goto("/welcome")
	await expect(page.getByLabel("Usuário", { exact: true })).toHaveAttribute(
		"data-slot",
		"input"
	)
	await page.getByLabel("Usuário", { exact: true }).fill("Test")
	await page.getByLabel("Senha", { exact: true }).fill("Test-only-123")
	await page.getByLabel("Confirmar senha").fill("Different-123")
	await page.getByRole("button", { name: "Criar acesso e continuar" }).click()
	await expect(page.getByRole("alert")).toContainText("não coincidem")
	await expect(page.getByLabel("Confirmar senha")).toHaveAttribute("aria-invalid", "true")
	await expect(page.getByLabel("Confirmar senha")).toHaveAttribute(
		"aria-describedby",
		"confirmation-error"
	)
	await expect(page.locator("#confirmation-error")).toHaveAttribute("data-slot", "field-error")
	expect(posts).toBe(0)
	await page.getByRole("button", { name: "Mostrar senha" }).click()
	await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "text")
	await page.getByLabel("Confirmar senha").fill("Test-only-123")
	await page.getByLabel("Confirmar senha").press("Enter")
	await expect(page.getByRole("status")).toContainText("Acesso criado")
	expect(posts).toBe(1)
	await expect(page).toHaveURL(/\/login\?created=true$/)
	await expect(page.getByLabel("Usuário", { exact: true })).toBeFocused()
	await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("")
})

test("rejected login can retry and success reads the actual host API", async ({ page }) => {
	let accepted = false
	await page.route("**/api/login", (route) => route.fulfill({ status: accepted ? 200 : 401 }))
	await page.route("**/api/config", (route) =>
		route.fulfill({ json: { status: true, sunshine_name: "Mock host", capture: "wgc" } })
	)
	await page.route("**/api/clients/list", (route) =>
		route.fulfill({ json: { status: true, named_certs: [], platform: "windows" } })
	)
	await page.route("**/api/apps", (route) =>
		route.fulfill({
			json: { apps: [], current_app: "", host_name: "Mock host", host_uuid: "test-host" }
		})
	)
	await page.goto("/login")
	await page.getByLabel("Usuário", { exact: true }).fill("Test")
	await page.getByLabel("Senha", { exact: true }).fill("Test-only-123")
	await page.getByRole("button", { name: "Entrar no painel" }).click()
	await expect(page.getByRole("alert")).toContainText("credenciais")
	await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeEnabled()
	accepted = true
	await page.getByRole("button", { name: "Entrar no painel" }).click()
	await expect(page.getByText("Mock host", { exact: true }).first()).toBeVisible()
	expect(await page.evaluate(() => localStorage.getItem("login"))).toBeNull()
})

test("login works by keyboard and exposes rejected authentication through shadcn Alert", async ({
	page
}) => {
	await page.route("**/api/login", (route) => route.fulfill({ status: 401 }))
	await page.goto("/login")
	await expect(page.getByLabel("Usuário", { exact: true })).toBeFocused()
	await page.keyboard.type("Test")
	await page.keyboard.press("Tab")
	await expect(page.getByLabel("Senha", { exact: true })).toBeFocused()
	await page.keyboard.type("Test-only-123")
	await page.keyboard.press("Enter")
	await expect(page.getByRole("alert")).toHaveAttribute("data-slot", "alert")
	await expect(page.getByRole("alert")).toContainText("credenciais")
	await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeEnabled()
})

test("expired host session blocks actions and opens login without replacing the current tab", async ({
	page
}) => {
	await page.route("**/api/config", (route) => route.fulfill({ status: 401 }))
	await page.goto("/")
	await expect(page.getByRole("status").filter({ hasText: "Entre novamente" })).toBeVisible()
	await expect(
		page.getByRole("button", { name: "Reiniciar host", exact: true })
	).toBeDisabled()
	const opening = page.waitForEvent("popup")
	await page.getByRole("link", { name: "Entrar novamente" }).click()
	const login = await opening
	await expect(login).toHaveURL(/\/login$/)
	await expect(login.getByLabel("Senha", { exact: true })).toBeVisible()
	await expect(page).toHaveURL(/\/$/)
})

for (const width of [390, 1280]) {
	test(`theme persistence and no overflow at ${width}px without legacy assets`, async ({
		page
	}) => {
		const resources: string[] = []
		const errors: string[] = []
		page.on("request", (request) => resources.push(request.url()))
		page.on("pageerror", (error) => errors.push(error.message))
		await page.setViewportSize({ width, height: 900 })
		await page.goto("/login")
		await expect(page.getByRole("combobox", { name: "Tema", exact: true })).toHaveAttribute(
			"data-slot",
			"select-trigger"
		)
		await page.getByRole("combobox", { name: "Tema", exact: true }).click()
		await page.getByRole("option", { name: "Escuro", exact: true }).click()
		await expect(page.locator("html")).toHaveClass(/dark/)
		await page.reload()
		await expect(page.locator("html")).toHaveClass(/dark/)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
		await page.screenshot({
			path: `/tmp/opencode/react-login-dark-${width}.png`,
			fullPage: true
		})
		await page.getByRole("combobox", { name: "Tema", exact: true }).click()
		await page.getByRole("option", { name: "Claro", exact: true }).click()
		await expect(page.locator("html")).not.toHaveClass(/dark/)
		await page.screenshot({
			path: `/tmp/opencode/react-login-light-${width}.png`,
			fullPage: true
		})
		expect(resources.some((url) => /bootstrap|\.vue|golden-auth\.css/.test(url))).toBe(false)
		expect(errors).toEqual([])
	})
}
