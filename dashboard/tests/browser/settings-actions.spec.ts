import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("saving config preserves unknown data and structures without restarting the host", async ({
	page
}) => {
	const state = await mockHost(page)
	const commands = [
		{ do: "prepare-test", undo: "restore-test", elevated: false, future: "keep" }
	]
	const mappings = {
		mixed: [
			{
				requested_resolution: "1920x1080",
				requested_fps: "120",
				final_resolution: "1920x1080",
				final_refresh_rate: "120"
			}
		],
		resolution_only: [],
		refresh_rate_only: []
	}
	state.config.global_prep_cmd = JSON.stringify(commands)
	state.config.dd_mode_remapping = JSON.stringify(mappings)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Edited host")
	await page.getByRole("button", { name: "Revisar e salvar" }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Arquivo salvo")
	const first = state.calls.find((call) => call.path === "config" && call.method === "POST")
	expect(first?.body.future_option).toBe("keep-me")
	expect(first?.body.global_prep_cmd).toEqual(commands)
	expect(first?.body.dd_mode_remapping).toEqual(mappings)
	expect(first?.body).not.toHaveProperty("status")
	expect(first?.body).not.toHaveProperty("platform")
	expect(state.calls.filter((call) => call.path === "restart")).toHaveLength(0)
	await page.locator("#sunshine_name").fill("Edited again")
	await page.getByRole("button", { name: "Revisar e salvar" }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("status")).toContainText("Arquivo salvo")
	expect(
		state.calls.filter((call) => call.path === "config" && call.method === "POST")
	).toHaveLength(2)
})

test("a stale config blocks overwrite and retains the user's draft", async ({ page }) => {
	const state = await mockHost(page)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Unsaved local edit")
	state.config.sunshine_name = "Changed elsewhere"
	await page.getByRole("button", { name: "Revisar e salvar" }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
		"mudou em outra sessão"
	)
	expect(
		state.calls.filter((call) => call.path === "config" && call.method === "POST")
	).toHaveLength(0)
	await page.getByRole("button", { name: "Voltar", exact: true }).click()
	await expect(page.locator("#sunshine_name")).toHaveValue("Unsaved local edit")
})

test("unsaved navigation uses shadcn confirmation instead of silently discarding edits", async ({
	page
}) => {
	const state = await mockHost(page)
	await page.goto("/config")
	await page.locator("#sunshine_name").fill("Pending edit")
	await page.getByRole("link", { name: "Dispositivos", exact: true }).click()
	await expect(page.getByRole("alertdialog")).toContainText("Descartar alterações não salvas")
	await page.getByRole("button", { name: "Continuar editando" }).click()
	await expect(page.locator("#sunshine_name")).toHaveValue("Pending edit")
	await page.getByRole("link", { name: "Dispositivos", exact: true }).click()
	await page.getByRole("button", { name: "Descartar e sair" }).click()
	await expect(page).toHaveURL(/\/pin$/)
	expect(
		state.calls.filter((call) => call.path === "config" && call.method === "POST")
	).toHaveLength(0)
})

test("regular Select changes NVENC settings and only exposes the two supported locale choices", async ({
	page
}) => {
	await mockHost(page)
	await page.goto("/config?section=nv")
	await expect(page.locator("#nvenc_preset")).toHaveAttribute("data-slot", "select-trigger")
	await page.locator("#nvenc_preset").click()
	await page.getByRole("option", { name: "P2", exact: true }).click()
	await expect(page.locator("#nvenc_preset")).toContainText("P2")
	await page.getByRole("button", { name: "Geral e automação", exact: true }).click()
	await page.locator("#locale").click()
	await expect(page.getByRole("option")).toHaveCount(2)
	await page.keyboard.press("Escape")
	await expect(page.locator('[data-slot="native-select"]')).toHaveCount(0)
})
