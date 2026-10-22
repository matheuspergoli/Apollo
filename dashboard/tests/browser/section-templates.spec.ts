import { expect, test } from "@playwright/test"
import { strFromU8, unzipSync } from "fflate"
import { mockHost } from "../fixtures/mock-api"

test("partial import preserves unsaved edits in a different section", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Outro rascunho")
	await page.getByRole("button", { name: "NVIDIA NVENC", exact: true }).click()
	const sectionFile = page.getByLabel("Arquivo JSON da seção", { exact: true })
	await sectionFile.setInputFiles({
		name: "partial.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-settings-section",
				version: 1,
				section: "nv",
				settings: { nvenc_preset: 4 }
			})
		)
	})
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Aplicar ao rascunho", exact: true })
		.click()
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Arquivo salvo")
	expect(host.config.sunshine_name).toBe("Outro rascunho")
	expect(host.config.nvenc_preset).toBe("4")
	expect(host.config.future_option).toBe("keep-me")
})

test("section ZIP documents every option and importing changes only a reviewed draft", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config?section=nv")
	const downloading = page.waitForEvent("download")
	await page.getByRole("button", { name: "Baixar template da seção", exact: true }).click()
	const downloaded = await downloading
	expect(downloaded.suggestedFilename()).toBe("apollo-nv-template.zip")
	const stream = await downloaded.createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	const files = unzipSync(Buffer.concat(chunks))
	const template = JSON.parse(strFromU8(files["apollo-nv/configuracao.json"]))
	expect(strFromU8(files["apollo-nv/LEIA-ME.md"])).toContain("nvenc_preset")
	expect(template.settings).not.toHaveProperty("sunshine_name")
	template.settings.nvenc_preset = 3
	const input = page.getByLabel("Arquivo JSON da seção", { exact: true })
	await input.setInputFiles({
		name: "nv.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(template))
	})
	const review = page.getByRole("dialog")
	await expect(review).toContainText("rascunho")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await review.getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(page.locator("#nvenc_preset")).toContainText("P1")
	await input.setInputFiles({
		name: "nv.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(template))
	})
	await review.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click()
	await expect(page.locator("#nvenc_preset")).toContainText("P3")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Arquivo salvo")
	expect(host.config.nvenc_preset).toBe("3")
	expect(host.config.sunshine_name).toBe("Test host")
	expect(host.config.future_option).toBe("keep-me")
})

test("wrong-section import is rejected without changing draft or writing", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config?section=nv")
	await page.getByLabel("Arquivo JSON da seção", { exact: true }).setInputFiles({
		name: "wrong.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-settings-section",
				version: 1,
				section: "amd",
				settings: { amd_usage: "ultralowlatency" }
			})
		)
	})
	await expect(page.getByRole("alert")).toContainText("não pertence à seção")
	await expect(page.getByRole("dialog")).toHaveCount(0)
	await expect(page.locator("#nvenc_preset")).toContainText("P1")
	expect(host.calls.some((call) => call.method === "POST")).toBe(false)
})
