import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("malformed display mappings can be corrected without discarding other config", async ({
	page
}) => {
	const host = await mockHost(page)
	host.config.dd_mode_remapping = JSON.stringify({
		mixed: [null],
		resolution_only: [],
		refresh_rate_only: []
	})
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto("/config")
	await page
		.getByRole("textbox", { name: "Buscar configurações", exact: true })
		.fill("dd_mode_remapping")
	const correction = page.getByRole("textbox", {
		name: "Corrigir JSON de regras de display",
		exact: true
	})
	await expect(correction).toBeVisible()
	await correction.fill("{")
	await expect(correction).toHaveValue("{")
	expect(host.calls.some((call) => call.path === "config" && call.method === "POST")).toBe(
		false
	)
	const mappings = {
		mixed: [
			{
				requested_resolution: "1920x1080",
				requested_fps: "60",
				final_resolution: "1920x1080",
				final_refresh_rate: "60"
			}
		],
		resolution_only: [],
		refresh_rate_only: []
	}
	await correction.fill(JSON.stringify(mappings))
	await expect(correction).toHaveCount(0)
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Arquivo salvo")
	expect(host.config.future_option).toBe("keep-me")
	expect(JSON.parse(String(host.config.dd_mode_remapping))).toEqual(mappings)
	expect(errors).toEqual([])
})

test("malformed command rows are recoverable without crashing or silently saving", async ({
	page
}) => {
	const host = await mockHost(page)
	if (host.apps[0]) host.apps[0]["prep-cmd"] = [null]
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	const correction = page.getByRole("textbox", { name: "Corrigir JSON", exact: true })
	await expect(correction).toHaveValue("[null]")
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("alert")).toBeVisible()
	expect(host.calls.some((call) => call.path === "apps" && call.method === "POST")).toBe(false)
	await correction.fill("[")
	await expect(correction).toHaveValue("[")
	expect(host.apps[0]?.["prep-cmd"]).toEqual([null])
	await correction.fill('[{"do":"echo corrigido","undo":"","elevated":false}]')
	await expect(correction).toHaveCount(0)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible()
	expect(host.apps[0]?.["prep-cmd"]).toEqual([
		{ do: "echo corrigido", undo: "", elevated: false }
	])
	expect(errors).toEqual([])
})
