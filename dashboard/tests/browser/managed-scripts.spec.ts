import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

const savedReference = {
	id: "a".repeat(32),
	revision: "b".repeat(64),
	name: "monitor.ps1",
	number: 1,
	arguments: []
}

test("unchanged script bindings save without a repeated review", async ({ page }) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	host.apps[0].detached = [{ cmd: "", "cmd-script": savedReference }]
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.getByLabel("Nome", { exact: true }).fill("Renamed game")
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	const writes = host.calls.filter((call) => call.method === "POST" && call.path === "apps")
	expect(writes).toHaveLength(1)
	expect(writes[0].body).not.toHaveProperty("scripts-approved")
	expect(writes[0].body.detached).toEqual([{ cmd: "", "cmd-script": savedReference }])
})

test("process-only policy opt-in is explicit, reviewed and retained without repeated approval", async ({
	page
}) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	host.apps[0].detached = [{ cmd: "", "cmd-script": savedReference }]
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	const policy = page.getByRole("switch", {
		name: "Permitir execução neste processo",
		exact: true
	})
	await expect(policy).not.toBeChecked()
	await policy.click()
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	const review = page.getByRole("dialog", { name: "Salvar vínculos de scripts?", exact: true })
	await expect(
		review.getByText("Política de execução: permitir neste processo", { exact: true })
	).toBeVisible()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await review.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(
		host.calls.filter((call) => call.path === "apps" && call.method === "POST")[0].body[
			"scripts-approved"
		]
	).toBe(true)
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await expect(
		page.getByRole("switch", { name: "Permitir execução neste processo", exact: true })
	).toBeChecked()
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	const writes = host.calls.filter((call) => call.path === "apps" && call.method === "POST")
	expect(writes).toHaveLength(2)
	expect(writes[1].body).not.toHaveProperty("scripts-approved")
	expect((writes[1].body.detached as Record<string, unknown>[])[0]["cmd-script"]).toEqual({
		...savedReference,
		"execution-policy": "bypass"
	})
})

test("a host-side binding conflict opens review without automatically repeating the write", async ({
	page
}) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	host.apps[0].detached = [{ cmd: "", "cmd-script": savedReference }]
	let writes = 0
	await page.route("**/api/apps", async (route) => {
		if (route.request().method() === "POST" && ++writes === 1)
			return route.fulfill({
				status: 409,
				json: { status: false, reason: "scripts_review_required" }
			})
		return route.fallback()
	})
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	const review = page.getByRole("dialog", { name: "Salvar vínculos de scripts?", exact: true })
	await expect(
		review.getByText("Os vínculos de scripts mudaram no host. Revise antes de salvar.", {
			exact: true
		})
	).toBeVisible()
	expect(writes).toBe(1)
	await review.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(writes).toBe(2)
})

test("replacing a detached command preserves the launcher, other commands and ordering", async ({
	page
}) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	host.apps[0].cmd = "C:\\Example\\launcher.exe"
	host.apps[0].detached = ["manual-before", "manual-monitor", "manual-after"]
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	const command = page.getByRole("group", { name: "Comando desanexado 2", exact: true })
	await command.getByRole("button", { name: "Usar script", exact: true }).click()
	await page
		.getByRole("dialog", { name: "Escolher script", exact: true })
		.getByLabel("Adicionar script deste dispositivo")
		.setInputFiles({
			name: "monitor.ps1",
			mimeType: "text/plain",
			buffer: Buffer.from("# Test-owned monitor\r\n")
		})
	await page
		.getByRole("dialog", { name: "Usar este script?", exact: true })
		.getByRole("button", { name: "Usar script", exact: true })
		.click()
	await command.getByRole("button", { name: "Adicionar argumento", exact: true }).click()
	await command
		.getByRole("textbox", { name: "Argumento 1 de comando desanexado 2", exact: true })
		.fill("literal")
	await command
		.getByRole("button", { name: "Subir comando desanexado 2", exact: true })
		.click()
	await expect(page.getByLabel("Comando de inicialização", { exact: true })).toHaveValue(
		"C:\\Example\\launcher.exe"
	)
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	const review = page.getByRole("dialog", { name: "Salvar vínculos de scripts?", exact: true })
	await expect(review.getByText("Desanexado, comando 1", { exact: true })).toBeVisible()
	await review.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(host.apps[0].cmd).toBe("C:\\Example\\launcher.exe")
	expect(host.apps[0].detached).toEqual([
		{
			cmd: "",
			"cmd-script": {
				file: {
					name: "monitor.ps1",
					data: Buffer.from("# Test-owned monitor\r\n").toString("base64")
				},
				arguments: ["literal"]
			}
		},
		"manual-before",
		"manual-after"
	])
})

test("script uploads stay in the app draft until explicit save review", async ({ page }) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	await page.goto("/apps")
	await page.getByRole("button", { name: "Novo aplicativo", exact: true }).click()
	await page.getByLabel("Nome", { exact: true }).fill("Script application")
	await page.getByRole("button", { name: "Usar script", exact: true }).click()
	const picker = page.getByRole("dialog", { name: "Escolher script" })
	await picker.getByLabel("Adicionar script deste dispositivo").setInputFiles({
		name: "example.ps1",
		mimeType: "text/plain",
		buffer: Buffer.from("# Test-owned content\r\n")
	})
	const selected = page.getByRole("dialog", { name: "Usar este script?", exact: true })
	await expect(selected.getByLabel("Conteúdo do script")).toHaveValue("# Test-owned content\n")
	await selected.getByRole("button", { name: "Usar script", exact: true }).click()
	await page.getByRole("button", { name: "Adicionar argumento", exact: true }).click()
	await page
		.getByRole("textbox", { name: "Argumento 1 de inicialização", exact: true })
		.fill("literal with spaces")
	expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	const review = page.getByRole("dialog", { name: "Salvar vínculos de scripts?" })
	await expect(review).toBeVisible()
	expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	await review.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	const saved = host.calls.find((call) => call.method === "POST" && call.path === "apps")?.body
	expect(saved?.["scripts-approved"]).toBe(true)
	expect(saved?.["cmd-script"]).toEqual({
		file: {
			name: "example.ps1",
			data: Buffer.from("# Test-owned content\r\n").toString("base64")
		},
		arguments: ["literal with spaces"]
	})
})

test("invalid saved references remain editable and can return to manual commands", async ({
	page
}) => {
	const host = await mockHost(page)
	host.scriptsSupported = true
	host.apps[0]["cmd-script"] = { id: "broken" }
	host.apps[0].cmd = ""
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await expect(
		page.getByText("A referência existente é inválida.", { exact: false })
	).toBeVisible()
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Usar comando manual", exact: true }).click()
	await page.getByLabel("Comando de inicialização", { exact: true }).fill("manual-command")
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(host.apps[0].cmd).toBe("manual-command")
	expect(host.apps[0]).not.toHaveProperty("cmd-script")
})

for (const theme of ["light", "dark"])
	test(`detached script controls fit mobile and can return to a manual command in ${theme}`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.addInitScript((value) => localStorage.setItem("theme", value), theme)
		const host = await mockHost(page)
		host.scriptsSupported = true
		host.apps[0].detached = [
			{
				cmd: "",
				"cmd-script": {
					id: "a".repeat(32),
					revision: "b".repeat(64),
					name: `${"monitor-".repeat(15)}example.ps1`,
					number: 1,
					arguments: ["literal with spaces"]
				}
			}
		]
		await page.goto("/apps")
		await page.getByRole("button", { name: "Editar", exact: true }).click()
		const command = page.getByRole("group", { name: "Comando desanexado 1", exact: true })
		await expect(
			command.getByRole("textbox", {
				name: "Argumento 1 de comando desanexado 1",
				exact: true
			})
		).toHaveValue("literal with spaces")
		expect(
			await command.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true)
		await command.getByRole("button", { name: "Usar comando manual", exact: true }).click()
		await command
			.getByRole("textbox", { name: "Comando 1", exact: true })
			.fill("manual-command\nwith-another-line")
		await expect(command.getByRole("textbox", { name: "Comando 1", exact: true })).toHaveValue(
			"manual-command\nwith-another-line"
		)
		expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	})

for (const theme of ["light", "dark"])
	test(`script library fits mobile and closes by keyboard in ${theme}`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.addInitScript((value) => localStorage.setItem("theme", value), theme)
		const host = await mockHost(page)
		host.scriptsSupported = true
		await page.goto("/apps")
		await page.getByRole("button", { name: "Scripts", exact: true }).click()
		const dialog = page.getByRole("dialog", { name: "Scripts", exact: true })
		await expect(dialog.getByText("Nenhum script salvo.", { exact: false })).toBeVisible()
		expect(
			await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true)
		await page.keyboard.press("Escape")
		await expect(dialog).not.toBeVisible()
		expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	})
