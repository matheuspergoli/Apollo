import { expect, test } from "@playwright/test"
import { strFromU8, unzipSync } from "fflate"
import { mockHost } from "../fixtures/mock-api"

function configuration(sections: Record<string, unknown>, kind = "saved") {
	return { format: "apollo-settings", version: 1, platform: "windows", kind, sections }
}

test("saved global export requires consent and reads fresh saved values instead of the draft", async ({
	page
}) => {
	const host = await mockHost(page)
	host.config.password = "not-exported-private-data"
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Rascunho não salvo")
	host.config.sunshine_name = "Valor atualizado no host"
	await page
		.getByRole("button", { name: "Exportar configurações salvas", exact: true })
		.click()
	const confirmation = page.getByRole("alertdialog")
	await expect(confirmation).toContainText("privados")
	await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click()
	await page
		.getByRole("button", { name: "Exportar configurações salvas", exact: true })
		.click()
	const ready = page.waitForEvent("download")
	await confirmation.getByRole("button", { name: "Confirmar", exact: true }).click()
	const download = await ready
	expect(download.suggestedFilename()).toBe("apollo-configuracoes-salvas.zip")
	const stream = await download.createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	const files = unzipSync(Buffer.concat(chunks))
	expect(Object.keys(files)).toHaveLength(14)
	const raw = strFromU8(files["apollo-configuracao/configuracao.json"])
	const parsed = JSON.parse(raw)
	expect(parsed.kind).toBe("saved")
	expect(Object.keys(parsed.sections)).toHaveLength(12)
	expect(parsed.sections.general.sunshine_name).toBe("Valor atualizado no host")
	expect(raw).not.toContain("Rascunho não salvo")
	expect(raw).not.toContain("not-exported-private-data")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await expect(page.locator("#sunshine_name")).toHaveValue("Rascunho não salvo")
})

test("global import reviews several sections, cancels safely, and saves only on explicit request", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	const input = page.getByLabel("Arquivo JSON global", { exact: true })
	const file = {
		name: "completo.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify(
				configuration({
					general: { sunshine_name: "Global ç" },
					nv: { nvenc_preset: 3 },
					network: { port: 50989 }
				})
			)
		)
	}
	await input.setInputFiles(file)
	const review = page.getByRole("dialog", { name: "Revisar importação global", exact: true })
	await expect(review).toContainText("3 opções diferentes em 3 seções")
	await expect(review).toContainText("Atenção à mudança de porta")
	await expect(review).toContainText(":50990")
	await expect(
		review.getByRole("region", { name: "Diferenças da configuração global", exact: true })
	).toContainText("Antes:")
	await review.getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(page.locator("#sunshine_name")).toHaveValue("Test host")
	await input.setInputFiles(file)
	await review.getByRole("button", { name: "Aplicar tudo ao rascunho", exact: true }).click()
	await expect(page.locator("#sunshine_name")).toHaveValue("Global ç")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("status").filter({ hasText: "Arquivo salvo" })).toBeVisible()
	expect(host.config).toMatchObject({
		sunshine_name: "Global ç",
		nvenc_preset: "3",
		port: "50989",
		future_option: "keep-me"
	})
	expect(
		host.calls.filter((call) => call.path === "config" && call.method === "POST")
	).toHaveLength(1)
	expect(host.calls.some((call) => call.path === "restart")).toBe(false)
})

test("one invalid section rejects the entire global import and retains unsaved edits", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Meu rascunho")
	const input = page.getByLabel("Arquivo JSON global", { exact: true })
	await input.setInputFiles({
		name: "invalido.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify(
				configuration({ general: { sunshine_name: "Não aplicar" }, network: { port: 65535 } })
			)
		)
	})
	await expect(page.getByRole("alert")).toBeVisible()
	await expect(page.getByRole("dialog")).toHaveCount(0)
	await expect(page.locator("#sunshine_name")).toHaveValue("Meu rascunho")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("complete template contains defaults and documents all sections without reading saved data", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	await expect(page.locator("#sunshine_name")).toHaveValue("Test host")
	await expect(page.locator('[data-slot="sidebar-footer"]')).toContainText("Test host")
	const reads = host.calls.filter(
		(call) => call.path === "config" && call.method === "GET"
	).length
	const ready = page.waitForEvent("download")
	await page.getByRole("button", { name: "Baixar template completo", exact: true }).click()
	const download = await ready
	expect(download.suggestedFilename()).toBe("apollo-template-completo.zip")
	const stream = await download.createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	const files = unzipSync(Buffer.concat(chunks))
	const data = JSON.parse(strFromU8(files["apollo-configuracao/configuracao.json"]))
	expect(data.kind).toBe("defaults")
	expect(data.sections.network.port).toBe(47989)
	expect(
		host.calls.filter((call) => call.path === "config" && call.method === "GET")
	).toHaveLength(reads)
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})

test("cross-platform defaults are identified and unchanged imports cannot be applied", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config")
	const data = {
		...configuration({ general: { sunshine_name: "Test host" } }, "defaults"),
		platform: "linux"
	}
	const input = page.getByLabel("Arquivo JSON global", { exact: true })
	await input.setInputFiles({
		name: "origem.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(data))
	})
	const review = page.getByRole("dialog", { name: "Revisar importação global", exact: true })
	await expect(review).toContainText("Este arquivo contém padrões")
	await expect(review).toContainText("Plataforma de origem diferente")
	await expect(
		review.getByRole("button", { name: "Aplicar tudo ao rascunho", exact: true })
	).toBeDisabled()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})
