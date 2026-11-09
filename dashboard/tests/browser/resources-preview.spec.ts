import { readdir, readFile } from "node:fs/promises"
import { expect, type Page, test } from "@playwright/test"

const preview = "http://127.0.0.1:4176/resources-preview.html"
const script = (
	name = "Meu script.ps1",
	content = '# Exemplo para leitura\r\nWrite-Output "teste"\r\n'
) => ({
	name,
	mimeType: "text/plain",
	buffer: Buffer.from(content)
})

async function openPreview(page: Page) {
	const api: string[] = []
	const errors: string[] = []
	await page.route("**/api/**", (route) => {
		api.push(route.request().url())
		return route.abort()
	})
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto(preview)
	await expect(
		page.getByRole("heading", { name: "Recursos gerenciados", exact: true })
	).toBeVisible()
	await expect(page.getByText("Sem conexão com o host", { exact: true })).toBeVisible()
	return { api, errors }
}

async function chooseScript(page: Page) {
	await page.getByRole("combobox", { name: "Origem de preparação", exact: true }).click()
	await page.getByRole("option", { name: "Script do Apollo", exact: true }).click()
	await page.getByRole("combobox", { name: "Script de preparação", exact: true }).click()
	await page.getByRole("option", { name: "Preparar ambiente.ps1", exact: true }).click()
}

async function approveSave(page: Page) {
	await page
		.getByRole("button", { name: "Revisar e salvar na simulação", exact: true })
		.click()
	const dialog = page.getByRole("dialog", { name: "Revisar gravação simulada", exact: true })
	const approval = dialog.getByRole("switch", { name: /Revisei os scripts/ })
	if (await approval.count()) await approval.check()
	await dialog
		.getByRole("button", { name: "Salvar somente na simulação", exact: true })
		.click()
}

test("manual editing and source changes preserve commands, require review and never call the host", async ({
	page
}) => {
	const evidence = await openPreview(page)
	await page
		.getByLabel("Comando de preparação", { exact: true })
		.fill("comando manual existente")
	await chooseScript(page)
	await page.getByRole("combobox", { name: "Origem de preparação", exact: true }).click()
	await page.getByRole("option", { name: "Comando manual", exact: true }).click()
	await expect(page.getByLabel("Comando de preparação", { exact: true })).toHaveValue(
		"comando manual existente"
	)
	await chooseScript(page)
	await page
		.getByRole("button", { name: "Revisar e salvar na simulação", exact: true })
		.click()
	const dialog = page.getByRole("dialog", { name: "Revisar gravação simulada", exact: true })
	await expect(
		dialog.getByRole("button", { name: "Salvar somente na simulação", exact: true })
	).toBeDisabled()
	await dialog.getByRole("switch", { name: /Revisei os scripts/ }).check()
	await dialog
		.getByRole("button", { name: "Salvar somente na simulação", exact: true })
		.click()
	await expect(page.getByRole("status")).toContainText("somente na memória")
	expect(evidence).toEqual({ api: [], errors: [] })
})

test("an incomplete script binding focuses its error rather than hiding a failure above the editor", async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	const evidence = await openPreview(page)
	await page.getByRole("combobox", { name: "Origem de preparação", exact: true }).click()
	await page.getByRole("option", { name: "Script do Apollo", exact: true }).click()
	await page
		.getByRole("button", { name: "Revisar e salvar na simulação", exact: true })
		.click()
	const error = page.getByRole("alert").filter({ hasText: "selecione uma revisão disponível" })
	await expect(error).toBeFocused()
	await expect(error).toBeInViewport()
	await expect(page.getByRole("dialog")).toHaveCount(0)
	expect(evidence).toEqual({ api: [], errors: [] })
})

test("package cancellation and draft discard leave saved resources untouched", async ({
	page
}) => {
	const evidence = await openPreview(page)
	const trigger = page.getByRole("button", { name: "Revisar pacote de exemplo", exact: true })
	await trigger.click()
	await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(trigger).toBeFocused()
	await expect(page.getByLabel("Nome do aplicativo", { exact: true })).toHaveValue(
		"Aplicativo de exemplo"
	)
	await trigger.click()
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Aplicar pacote ao rascunho", exact: true })
		.click()
	await expect(page.getByLabel("Nome do aplicativo", { exact: true })).toHaveValue(
		"Aplicativo importado"
	)
	await page.getByRole("tab", { name: "Recursos", exact: true }).click()
	await expect(
		page.getByRole("heading", { name: "Preparar exemplo.ps1", exact: true })
	).toBeVisible()
	await expect(
		page.getByRole("button", { name: "Excluir Preparar exemplo.ps1", exact: true })
	).toBeDisabled()
	await page.getByRole("tab", { name: "Editor do aplicativo", exact: true }).click()
	await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click()
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Descartar rascunho na simulação", exact: true })
		.click()
	await page.getByRole("tab", { name: "Recursos", exact: true }).click()
	await expect(
		page.getByRole("heading", { name: "Preparar exemplo.ps1", exact: true })
	).toHaveCount(0)
	await expect(
		page.getByRole("heading", { name: "Preparar ambiente.ps1", exact: true })
	).toBeVisible()
	expect(evidence).toEqual({ api: [], errors: [] })
})

test("local files are read-only previews, reject invalid bytes and can be removed only when unused", async ({
	page
}) => {
	const evidence = await openPreview(page)
	await page.getByRole("tab", { name: "Recursos", exact: true }).click()
	await page
		.getByRole("button", { name: "Adicionar script à biblioteca simulada", exact: true })
		.click()
	const dialog = page.getByRole("dialog")
	const input = dialog.getByLabel("Script PowerShell deste dispositivo", { exact: true })
	await input.setInputFiles({
		name: "invalido.ps1",
		mimeType: "text/plain",
		buffer: Buffer.from([255, 254, 0])
	})
	await expect(dialog.getByRole("alert")).toContainText("UTF-8")
	await expect(
		dialog.getByRole("button", { name: "Adicionar à biblioteca simulada", exact: true })
	).toBeDisabled()
	await input.setInputFiles(
		script(
			"Meu script.ps1",
			'# <img src=x onerror="alert(1)">\r\nWrite-Output "somente leitura"'
		)
	)
	await expect(
		dialog.getByRole("textbox", { name: "Código somente para leitura", exact: true })
	).toHaveAttribute("readonly", "")
	await expect(
		dialog.getByRole("textbox", { name: "Código somente para leitura", exact: true })
	).toHaveValue(/somente leitura/)
	await dialog
		.getByRole("button", { name: "Adicionar à biblioteca simulada", exact: true })
		.click()
	await expect(
		page.getByRole("button", { name: "Excluir Preparar ambiente.ps1", exact: true })
	).toBeDisabled()
	await page.getByRole("button", { name: "Excluir Meu script.ps1", exact: true }).click()
	await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(
		page.getByRole("heading", { name: "Meu script.ps1", exact: true })
	).toBeVisible()
	await page.getByRole("button", { name: "Excluir Meu script.ps1", exact: true }).click()
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Excluir somente na simulação", exact: true })
		.click()
	await expect(page.getByRole("heading", { name: "Meu script.ps1", exact: true })).toHaveCount(
		0
	)
	expect(evidence).toEqual({ api: [], errors: [] })
})

test("adding a revision does not switch existing bindings or grant elevation", async ({
	page
}) => {
	const evidence = await openPreview(page)
	await chooseScript(page)
	await approveSave(page)
	await page.getByRole("tab", { name: "Recursos", exact: true }).click()
	await page
		.getByRole("button", { name: "Adicionar revisão de Preparar ambiente.ps1", exact: true })
		.click()
	await page
		.getByRole("dialog")
		.getByLabel("Script PowerShell deste dispositivo", { exact: true })
		.setInputFiles(script("Preparar ambiente.ps1", "# Nova revisão"))
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Adicionar revisão na simulação", exact: true })
		.click()
	await expect(
		page.getByRole("region", { name: "Uso de Preparar ambiente.ps1", exact: true })
	).toContainText("revisão 1")
	await page.getByRole("tab", { name: "Editor do aplicativo", exact: true }).click()
	await expect(
		page.getByRole("combobox", { name: "Revisão de preparação", exact: true })
	).toContainText("Revisão 1")
	await expect(
		page.getByRole("switch", {
			name: "Executar inicialização com privilégios elevados",
			exact: true
		})
	).not.toBeChecked()
	await expect(
		page.getByRole("switch", {
			name: "Executar preparação e desfazer com privilégios elevados",
			exact: true
		})
	).not.toBeChecked()
	expect(evidence).toEqual({ api: [], errors: [] })
})

for (const [option, outcome] of [
	["Sessão expirada", "Sessão expirada na simulação"],
	["Conflito de edição", "Consulte antes de repetir"],
	["Aplicada, mas sem confirmação", "Consulte antes de repetir"]
] as const) {
	test(`${option} retains the draft and requires explicit reconciliation without replay`, async ({
		page
	}) => {
		const evidence = await openPreview(page)
		await page.getByLabel("Nome do aplicativo", { exact: true }).fill("Meu rascunho")
		await page.getByText("Cenários de validação do protótipo", { exact: true }).click()
		await page
			.getByRole("combobox", { name: "Próxima gravação simulada", exact: true })
			.click()
		await page.getByRole("option", { name: option, exact: true }).click()
		await approveSave(page)
		await expect(page.getByText(outcome, { exact: true })).toBeVisible()
		await expect(page.getByLabel("Nome do aplicativo", { exact: true })).toHaveValue(
			"Meu rascunho"
		)
		await expect(
			page.getByRole("button", { name: "Revisar e salvar na simulação", exact: true })
		).toBeDisabled()
		await page
			.getByRole("button", {
				name:
					option === "Sessão expirada"
						? "Revalidar sessão simulada"
						: "Consultar versão salva na simulação",
				exact: true
			})
			.click()
		await expect(page.getByRole("status")).toContainText(
			option === "Sessão expirada"
				? "Nenhuma operação foi repetida"
				: "nenhuma gravação foi repetida"
		)
		expect(evidence).toEqual({ api: [], errors: [] })
	})
}

for (const width of [390, 768, 1440]) {
	for (const theme of ["light", "dark"]) {
		test(`prototype remains usable at ${width}px in ${theme} with long filenames and keyboard dialogs`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize({ width, height: 900 })
			await page.emulateMedia({
				reducedMotion: "reduce",
				colorScheme: theme as "light" | "dark"
			})
			const evidence = await openPreview(page)
			await expect(page.locator("html")).toHaveClass(
				theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/
			)
			await page.getByRole("tab", { name: "Recursos", exact: true }).click()
			await page
				.getByRole("button", { name: "Adicionar script à biblioteca simulada", exact: true })
				.click()
			const filename = `${"Um nome extenso ".repeat(8)}.ps1`
			await page
				.getByRole("dialog")
				.getByLabel("Script PowerShell deste dispositivo", { exact: true })
				.setInputFiles(script(filename))
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Adicionar à biblioteca simulada", exact: true })
				.click()
			const inspect = page.getByRole("button", {
				name: `Ver conteúdo de ${filename}`,
				exact: true
			})
			await inspect.focus()
			await page.keyboard.press("Enter")
			const dialog = page.getByRole("dialog", { name: "Conteúdo do script", exact: true })
			await expect(dialog).toBeVisible()
			await page.screenshot({ path: testInfo.outputPath("resource-content.png") })
			await dialog.getByRole("button", { name: "Fechar", exact: true }).first().click()
			await expect(inspect).toBeFocused()
			await page.screenshot({
				path: testInfo.outputPath("resource-library.png"),
				fullPage: true
			})
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true)
			expect(evidence).toEqual({ api: [], errors: [] })
		})
	}
}

test("production artifacts contain neither the prototype entry nor its executable UI", async () => {
	const files = await readdir("dist", { recursive: true })
	expect(files).not.toContain("resources-preview.html")
	for (const file of files.filter((name) => name.endsWith(".js"))) {
		const content = await readFile(`dist/${file}`, "utf8")
		expect(content).not.toContain("Próxima gravação simulada")
		expect(content).not.toContain("sample-script")
	}
})

test("touch navigation keeps package review and source selection usable without a desktop pointer", async ({
	browser
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
		reducedMotion: "reduce"
	})
	try {
		const page = await context.newPage()
		const evidence = await openPreview(page)
		await page.getByRole("button", { name: "Revisar pacote de exemplo", exact: true }).tap()
		const dialog = page.getByRole("dialog", { name: "Revisar pacote de exemplo", exact: true })
		await dialog.getByRole("button", { name: "Aplicar pacote ao rascunho", exact: true }).tap()
		await expect(page.getByLabel("Nome do aplicativo", { exact: true })).toHaveValue(
			"Aplicativo importado"
		)
		await page.getByRole("tab", { name: "Recursos", exact: true }).tap()
		await expect(
			page.getByRole("heading", { name: "Preparar exemplo.ps1", exact: true })
		).toBeVisible()
		await page.getByRole("tab", { name: "Editor do aplicativo", exact: true }).tap()
		await expect(
			page.getByRole("combobox", { name: "Origem de preparação", exact: true })
		).toContainText("Script do Apollo")
		expect(evidence).toEqual({ api: [], errors: [] })
	} finally {
		await context.close()
	}
})
