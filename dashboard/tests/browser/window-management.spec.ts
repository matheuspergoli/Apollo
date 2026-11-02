import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("explicit UUID selection saves without operating windows or changing display options", async ({
	page
}) => {
	const host = await mockHost(page)
	host.apps.push({ uuid: "12345678-abcd-4321-9876-1234567890ab", name: "Desktop de exemplo" })
	let statusReads = 0
	await page.route("**/api/window-management", (route) => {
		statusReads += 1
		return route.fulfill({ status: 503 })
	})
	await page.goto("/config?section=window-session")
	const recovery = page.getByRole("button", { name: "Recuperar janelas agora" })
	await expect(recovery).toHaveCount(0)
	await expect(
		page.getByRole("region", { name: "Estado do gerenciamento de janelas" })
	).toHaveCount(0)
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
	await expect(recovery).toHaveCount(0)
	expect(host.calls.filter((call) => call.path === "window-management")).toHaveLength(0)
	expect(statusReads).toBe(0)
	await expect(
		page.getByRole("main").getByRole("link", { name: "Diagnóstico", exact: true })
	).toHaveAttribute("href", "/troubleshooting")
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
	await page.goto("/troubleshooting")
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
	await expect(state.getByText("Recuperação solicitada", { exact: true })).toHaveCount(0)
	host.windowStatus = {
		...host.windowStatus,
		generation: 2,
		phase: "active",
		reason: "active",
		manual_available: true
	}
	await state.getByRole("button", { name: "Atualizar estado" }).click()
	await expect(state.getByRole("button", { name: "Recuperar janelas agora" })).toBeEnabled()
	await expect(state.getByText("Recuperação solicitada", { exact: true })).toHaveCount(0)
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		1
	)
})

test("failed diagnostic status cannot leave a stale recovery action enabled or write settings", async ({
	page
}) => {
	const host = await mockHost(page)
	host.windowStatus = {
		...host.windowStatus,
		phase: "active",
		reason: "active",
		manual_available: true
	}
	await page.goto("/troubleshooting")
	await expect(page.getByRole("button", { name: "Recuperar janelas agora" })).toBeEnabled()
	await page.route("**/api/window-management", (route) => route.fulfill({ status: 503 }))
	await page.getByRole("button", { name: "Atualizar estado" }).click()
	await expect(page.getByRole("button", { name: "Recuperar janelas agora" })).toBeDisabled()
	expect(host.calls.filter((call) => call.method === "POST")).toHaveLength(0)
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		0
	)
})

test("diagnostics explain the operation without attributing an inspection code to all failed movements", async ({
	page
}) => {
	const host = await mockHost(page)
	host.windowStatus = {
		...host.windowStatus,
		generation: 2,
		phase: "stopped",
		reason: "stopped",
		failed: 3,
		skipped: 3,
		last_error: 13,
		diagnostics: {
			...host.windowStatus.diagnostics,
			inspection_failures: 1,
			confirmation_timeouts: 3,
			last_operation: "inspect",
			last_reason: "inspection_failed",
			last_stage: "normal_geometry",
			unconfirmed_operation: "confirm_move",
			unconfirmed_reason: "confirmation_timeout",
			unconfirmed_observation: "destination_mismatch",
			unconfirmed_state: "maximized",
			unconfirmed_checks: 2
		}
	}
	await page.goto("/troubleshooting")
	const state = page.getByRole("region", { name: "Estado do gerenciamento de janelas" })
	await expect(state).toContainText("Geração 2")
	const summary = state.getByText("Diagnósticos das operações", { exact: true })
	await summary.focus()
	await page.keyboard.press("Enter")
	await expect(state.getByText(/Inspeção de janela:.*Código Win32 13/)).toBeVisible()
	await expect(
		state.getByText(/Última operação sem confirmação:.*monitor diferente/)
	).toBeVisible()
	await expect(state.getByText(/Última operação sem confirmação:/)).not.toContainText(
		"Código Win32 13"
	)
	await expect(state).toContainText("Categorias podem se sobrepor")
	await expect(state.getByRole("button", { name: "Recuperar janelas agora" })).toBeDisabled()
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		0
	)
})

test("returning to active after interruption recommends recovery but never replays it", async ({
	page
}) => {
	const host = await mockHost(page)
	host.windowStatus = {
		...host.windowStatus,
		phase: "paused",
		reason: "session_not_exclusive",
		recovery_required: true
	}
	await page.goto("/troubleshooting")
	const state = page.getByRole("region", { name: "Estado do gerenciamento de janelas" })
	await expect(
		state.getByText("Recuperação manual recomendada", { exact: true })
	).toBeVisible()
	const recovery = state.getByRole("button", { name: "Recuperar janelas agora" })
	await expect(recovery).toBeDisabled()
	host.windowStatus = {
		...host.windowStatus,
		phase: "active",
		reason: "active",
		manual_available: true
	}
	await state.getByRole("button", { name: "Atualizar estado" }).click()
	await expect(recovery).toBeEnabled()
	await expect(
		state.getByText("Recuperação manual recomendada", { exact: true })
	).toBeVisible()
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		0
	)
	await recovery.click()
	await expect(state).toContainText("Recuperação solicitada")
	// HTTP acceptance only queues a pass. Do not clear the warning or claim that
	// anything moved until the host reports the resulting controller state.
	await expect(
		state.getByText("Recuperação manual recomendada", { exact: true })
	).toBeVisible()
	expect(host.windowStatus.moved).toBe(0)
	expect(host.calls.filter((call) => call.path === "window-management/recover")).toHaveLength(
		1
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
	await page.goto("/troubleshooting")
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
		host.windowStatus = {
			...host.windowStatus,
			phase: "paused",
			reason: "capture_unavailable",
			recovery_required: true
		}
		await page.setViewportSize({ width: 390, height: 844 })
		await page.emulateMedia({ colorScheme })
		await page.goto("/config?section=window-session")
		await expect(
			page.getByRole("combobox", { name: "Aplicativo da sessão Desktop" })
		).toBeEnabled()
		await expect(page.getByRole("button", { name: "Recuperar janelas agora" })).toHaveCount(0)
		await page.goto("/troubleshooting")
		await expect(page.getByRole("button", { name: "Recuperar janelas agora" })).toBeDisabled()
		await page.getByText("Diagnósticos das operações", { exact: true }).click()
		await expect(
			page.getByText("Recuperação manual recomendada", { exact: true })
		).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		)
	})
}
