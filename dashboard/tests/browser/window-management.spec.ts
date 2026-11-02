import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("explicit UUID selection saves without operating windows or changing display options", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/config?section=window-session")
	const recovery = page.getByRole("button", { name: "Recuperar janelas agora" })
	await expect(recovery).toBeDisabled()
	const selection = page.getByRole("combobox", { name: "Aplicativo da sessão Desktop" })
	await selection.focus()
	await page.keyboard.press("Enter")
	await page.getByRole("option", { name: /Desktop de exemplo/ }).click()
	await page.getByRole("button", { name: "Revisar e salvar" }).click()
	const review = page.getByRole("dialog")
	await expect(review).toContainText("wsm_application_uuid")
	await review.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await expect(page.getByText("Arquivo salvo", { exact: true })).toBeVisible()
	expect(host.config.wsm_application_uuid).toBe("12345678-abcd-4321-9876-1234567890ab")
	expect(host.config.headless_mode).toBe("enabled")
	expect(host.config.capture).toBe("wgc")
	expect(host.config.future_option).toBe("keep-me")
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		0
	)
	await expect(recovery).toBeDisabled()
})

test("manual request is explicit and does not invent successful movements", async ({
	page
}) => {
	const host = await mockHost(page)
	host.windowStatus = {
		...host.windowStatus,
		phase: "active",
		reason: "active",
		manual_available: true,
		moved: 2
	}
	await page.goto("/config?section=window-session")
	const state = page.getByRole("region", { name: "Estado do gerenciamento de janelas" })
	await expect(state).toContainText("Ativo")
	await state.getByRole("button", { name: "Recuperar janelas agora" }).click()
	await expect(state).toContainText("Recuperação solicitada")
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		1
	)
	expect(host.windowStatus.moved).toBe(2)
	host.windowStatus = {
		...host.windowStatus,
		phase: "paused",
		reason: "capture_unavailable",
		manual_available: false
	}
	await state.getByRole("button", { name: "Atualizar estado" }).click()
	await expect(state).toContainText("Pausado")
	await expect(state.getByRole("button", { name: "Recuperar janelas agora" })).toBeDisabled()
})

test("failed status cannot leave a stale recovery action enabled and preserves the draft", async ({
	page
}) => {
	const host = await mockHost(page)
	host.windowStatus = {
		...host.windowStatus,
		phase: "active",
		reason: "active",
		manual_available: true
	}
	await page.goto("/config?section=window-session")
	await page.getByRole("switch", { name: "Restaurar posições ao encerrar" }).click()
	await page.route("**/api/window-management", (route) => route.fulfill({ status: 503 }))
	await page.getByRole("button", { name: "Atualizar estado" }).click()
	await expect(page.getByRole("button", { name: "Recuperar janelas agora" })).toBeDisabled()
	await expect(
		page.getByRole("switch", { name: "Restaurar posições ao encerrar" })
	).not.toBeChecked()
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		0
	)
})

test("rejected recovery is reported without a success claim or automatic replay", async ({
	page
}) => {
	const host = await mockHost(page)
	host.windowStatus = {
		...host.windowStatus,
		phase: "active",
		reason: "active",
		manual_available: true
	}
	let requests = 0
	await page.route("**/api/window-management/recover", (route) => {
		requests += 1
		return route.fulfill({
			json: { status: false, message: "A sessão perdeu a permissão de entrada." }
		})
	})
	await page.goto("/config?section=window-session")
	await page.getByRole("button", { name: "Recuperar janelas agora" }).click()
	await expect(page.getByText("A sessão perdeu a permissão de entrada.")).toBeVisible()
	await expect(page.getByText("Recuperação solicitada", { exact: true })).toHaveCount(0)
	await page.getByRole("button", { name: "Atualizar estado" }).click()
	await expect(page.getByText("A sessão perdeu a permissão de entrada.")).toBeVisible()
	expect(requests).toBe(1)
})

for (const colorScheme of ["light", "dark"] as const) {
	test(`window controls fit mobile and retain labels in ${colorScheme} theme`, async ({
		page
	}) => {
		const host = await mockHost(page)
		host.config.wsm_application_uuid = "12345678-abcd-4321-9876-1234567890ab"
		await page.setViewportSize({ width: 390, height: 844 })
		await page.emulateMedia({ colorScheme })
		await page.goto("/config?section=window-session")
		await expect(
			page.getByRole("combobox", { name: "Aplicativo da sessão Desktop" })
		).toBeEnabled()
		await expect(page.getByRole("button", { name: "Recuperar janelas agora" })).toBeDisabled()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
	})
}
