import { expect, test } from "@playwright/test"
import { strFromU8, unzipSync } from "fflate"
import { mockHost } from "../fixtures/mock-api"

test("Enter in a multiline application field adds a line instead of submitting", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-detached").fill("linha1")
	await page.locator("#app-detached").press("End")
	await page.locator("#app-detached").press("Enter")
	await expect(page.locator("#app-detached")).toHaveValue("linha1\n")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("application status follows external close without sending a destructive request", async ({
	page
}) => {
	const host = await mockHost(page)
	host.current = "app-1"
	await page.clock.install()
	await page.goto("/apps")
	await expect(page.getByText("Em execução", { exact: true })).toBeVisible()
	host.current = ""
	await page.clock.fastForward(3100)
	await expect(
		page.getByRole("button", { name: "Iniciar no host", exact: true })
	).toBeVisible()
	await expect(page.getByText("Em execução", { exact: true })).toHaveCount(0)
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("application polling pauses while editing and never replaces a draft", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.clock.install()
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-name").fill("Meu rascunho")
	const reads = host.calls.filter(
		(call) => call.path === "apps" && call.method === "GET"
	).length
	await page.clock.fastForward(10_000)
	expect(
		host.calls.filter((call) => call.path === "apps" && call.method === "GET")
	).toHaveLength(reads)
	await expect(page.locator("#app-name")).toHaveValue("Meu rascunho")
})

test("external state changes close an outdated confirmation instead of changing its operation", async ({
	page
}) => {
	const host = await mockHost(page)
	host.current = "app-1"
	await page.clock.install()
	await page.goto("/apps")
	await page.getByRole("button", { name: "Encerrar", exact: true }).click()
	await expect(page.getByRole("alertdialog")).toBeVisible()
	host.current = ""
	await page.clock.fastForward(3100)
	await expect(page.getByRole("alertdialog")).toBeHidden()
	await expect(
		page.getByRole("button", { name: "Iniciar no host", exact: true })
	).toBeVisible()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("failed app polling marks stale state unknown, pauses and recovers on manual read", async ({
	page
}) => {
	const host = await mockHost(page)
	host.current = "app-1"
	let fail = false,
		reads = 0
	await page.route("**/api/apps", async (route) => {
		reads++
		if (fail) return route.fulfill({ status: 503 })
		return route.fallback()
	})
	await page.clock.install()
	await page.goto("/apps")
	await expect(page.getByText("Em execução", { exact: true })).toBeVisible()
	fail = true
	await page.clock.fastForward(3100)
	await expect(page.getByText("Estado não confirmado", { exact: true })).toBeVisible()
	await expect(page.getByRole("button", { name: "Encerrar", exact: true })).toBeDisabled()
	const stoppedAt = reads
	await page.clock.fastForward(9000)
	expect(reads).toBe(stoppedAt)
	fail = false
	host.current = ""
	await page.getByRole("button", { name: "Atualizar aplicativos", exact: true }).click()
	await expect(page.getByText("Disponível", { exact: true })).toBeVisible()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("quick restart is available globally but blocked by unsaved edits; Enter reviews instead of saving", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	const restart = page.getByRole("button", { name: "Reiniciar host", exact: true })
	await expect(restart).toBeEnabled()
	await page.locator("#sunshine_name").fill("Rascunho")
	await expect(restart).toBeDisabled()
	const search = page.getByRole("textbox", { name: "Buscar configurações", exact: true })
	await search.fill("nome")
	await search.press("Enter")
	await expect(page.getByRole("dialog")).toHaveCount(0)
	await page.locator("#sunshine_name").press("Enter")
	await expect(page.getByRole("dialog")).toBeVisible()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Voltar", exact: true }).click()
	await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click()
	await expect(restart).toBeEnabled()
})

test("section export reads saved values rather than a local draft and contains only that section", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Não exportar este rascunho")
	host.config.sunshine_name = "Valor salvo fresco"
	host.config.nvenc_preset = "invalid in another section"
	await page
		.getByRole("button", { name: "Exportar configurações salvas da seção", exact: true })
		.click()
	const ready = page.waitForEvent("download")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	const stream = await (await ready).createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	const files = unzipSync(Buffer.concat(chunks))
	const parsed = JSON.parse(strFromU8(files["apollo-general/configuracao.json"]))
	expect(parsed.section).toBe("general")
	expect(parsed.settings.sunshine_name).toBe("Valor salvo fresco")
	expect(parsed.settings).not.toHaveProperty("nvenc_preset")
	await expect(page.locator("#sunshine_name")).toHaveValue("Não exportar este rascunho")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("permission profile import preserves identity and other drafts and saves only on explicit submit", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	await page.getByLabel("Nome", { exact: true }).fill("Nome local")
	const input = page.getByLabel("Arquivo JSON de permissões", { exact: true })
	const file = {
		name: "permissoes.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-device-permissions",
				version: 1,
				kind: "device",
				settings: { perm: 0x03000100, display_mode: "1920x1080x59.94" }
			})
		)
	}
	await input.setInputFiles(file)
	const review = page.getByRole("dialog", {
		name: "Revisar importação de permissões",
		exact: true
	})
	await expect(review).toContainText("Controle")
	await review.getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(page.getByLabel("Modo de display específico", { exact: true })).toHaveValue(
		"1920x1080x120"
	)
	await input.setInputFiles(file)
	await review.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click()
	await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Nome local")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByLabel("Nome", { exact: true }).press("Enter")
	await expect(
		page.getByRole("button", { name: "Editar permissões", exact: true })
	).toBeVisible()
	expect(host.clients[0]).toMatchObject({
		uuid: "device-1",
		name: "Nome local",
		perm: 0x03000100,
		display_mode: "1920x1080x59.94"
	})
	expect(host.calls.filter((call) => call.path === "clients/update")).toHaveLength(1)
	expect(host.calls.some((call) => call.path === "pin" || call.path.includes("unpair"))).toBe(
		false
	)
})

test("permission export includes draft values but excludes pairing identity", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	await page.getByRole("switch", { name: "Controle", exact: true }).click()
	await page
		.getByRole("button", { name: "Exportar permissões do editor", exact: true })
		.click()
	const ready = page.waitForEvent("download")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	const stream = await (await ready).createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	const files = unzipSync(Buffer.concat(chunks))
	const raw = strFromU8(files["apollo-dispositivo/dispositivo.json"])
	expect(JSON.parse(raw).settings.perm).toBe(0x03000100)
	expect(raw).not.toContain("device-1")
	expect(raw).not.toContain("Galaxy S25+")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("permission import rejects certificate/identity changes without altering draft", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	const input = page.getByLabel("Arquivo JSON de permissões", { exact: true })
	await input.setInputFiles({
		name: "bad.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-device-permissions",
				version: 1,
				kind: "device",
				settings: { uuid: "other", perm: 0 }
			})
		)
	})
	await expect(page.getByRole("alert")).toBeVisible()
	await expect(page.getByRole("dialog")).toHaveCount(0)
	await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Galaxy S25+")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})
