import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("connection hooks and elevation are saved only for the edited device", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	const connect = page
		.locator("section")
		.filter({ has: page.getByRole("heading", { name: "Ao conectar", exact: true }) })
	await connect.getByRole("button", { name: "Adicionar etapa", exact: true }).click()
	await page.locator("#client-do-0-cmd").fill("echo conectado ç")
	await connect
		.getByRole("switch", { name: "Executar com privilégios elevados", exact: true })
		.click()
	expect(host.clients[0]?.do).toEqual([])
	await page.getByRole("button", { name: "Salvar dispositivo", exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Editar permissões", exact: true })
	).toBeVisible()
	expect(host.clients[0]?.do).toEqual([{ cmd: "echo conectado ç", elevated: true }])
	expect(host.clients[0]?.undo).toEqual([])
	expect(
		host.calls.filter((call) => call.path === "clients/update").map((call) => call.body.uuid)
	).toEqual(["device-1"])
})

test("unpair-all requires confirmation and does not run after cancellation", async ({
	page
}) => {
	const host = await mockHost(page)
	host.clients.push({
		uuid: "device-2",
		name: "Segundo cliente",
		perm: 0x03000000,
		connected: false
	})
	await page.goto("/pin")
	await page.getByRole("button", { name: "Desvincular todos", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Cancelar", exact: true })
		.click()
	expect(host.clients).toHaveLength(2)
	expect(host.calls.some((call) => call.path === "clients/unpair-all")).toBe(false)
	await page.getByRole("button", { name: "Desvincular todos", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(page.getByText("Nenhum dispositivo encontrado", { exact: true })).toBeVisible()
	expect(host.clients).toHaveLength(0)
	expect(host.calls.filter((call) => call.path === "clients/unpair-all")).toHaveLength(1)
})

test("permission changes remain local until explicitly saved", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	await page.getByRole("switch", { name: "Teclado", exact: true }).click()
	await expect(page.getByRole("switch", { name: "Teclado", exact: true })).toBeChecked()
	expect(host.clients[0]?.perm).toBe(0x03000000)
	await page.getByRole("button", { name: "Salvar dispositivo", exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Editar permissões", exact: true })
	).toBeVisible()
	expect(host.clients[0]?.perm).toBe(0x03001000)
})

test("invalid display mode blocks device writes and retains the entered value", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	await page.getByLabel("Modo de display específico", { exact: true }).fill("inválido")
	await page.getByRole("button", { name: "Salvar dispositivo", exact: true }).click()
	await expect(
		page.getByText(
			"Use largura x altura x FPS, por exemplo 1920x1080x120 ou 1920x1080x59.94.",
			{ exact: true }
		)
	).toBeVisible()
	await expect(page.getByLabel("Modo de display específico", { exact: true })).toHaveValue(
		"inválido"
	)
	expect(host.calls.some((call) => call.path === "clients/update")).toBe(false)
})

test("renaming preserves existing permissions and cancellation protects the draft", async ({
	page
}) => {
	const host = await mockHost(page)
	if (host.clients[0]) {
		host.clients[0].future_device_option = "preserve"
		host.clients[0].perm = 0x03000100
	}
	await page.goto("/pin")
	await page.getByRole("button", { name: "Editar permissões", exact: true }).click()
	await page.getByLabel("Nome", { exact: true }).fill("Dispositivo ç")
	await page.getByRole("button", { name: "Cancelar edição", exact: true }).click()
	const dialog = page.getByRole("alertdialog")
	await expect(dialog).toBeVisible()
	await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Dispositivo ç")
	expect(host.calls.some((call) => call.path === "clients/update")).toBe(false)
	await page.getByRole("button", { name: "Salvar dispositivo", exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Editar permissões", exact: true })
	).toBeVisible()
	expect(host.clients[0]).toMatchObject({
		name: "Dispositivo ç",
		perm: 0x03000100,
		future_device_option: "preserve"
	})
	expect(host.calls.filter((call) => call.path === "clients/update")).toHaveLength(1)
})

test("disconnect keeps pairing and sends only the selected device ID", async ({ page }) => {
	const host = await mockHost(page)
	if (host.clients[0]) host.clients[0].connected = true
	await page.goto("/pin")
	await page.getByRole("button", { name: "Desconectar", exact: true }).click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(page.getByRole("alertdialog")).toBeHidden()
	await expect(page.getByRole("button", { name: "Desconectar", exact: true })).toHaveCount(0)
	expect(host.clients).toHaveLength(1)
	expect(
		host.calls.filter((call) => call.path === "clients/disconnect").map((call) => call.body)
	).toEqual([{ uuid: "device-1" }])
	expect(host.calls.some((call) => call.path.startsWith("clients/unpair"))).toBe(false)
})

test("unpair cancellation preserves the device; confirmation revokes it", async ({ page }) => {
	const host = await mockHost(page)
	await page.goto("/pin")
	const revoke = page.getByRole("button", {
		name: "Desvincular Dispositivo de exemplo",
		exact: true
	})
	await revoke.click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Cancelar", exact: true })
		.click()
	expect(host.clients).toHaveLength(1)
	expect(host.calls.some((call) => call.path === "clients/unpair")).toBe(false)
	await revoke.click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await expect(page.getByText("Nenhum dispositivo encontrado", { exact: true })).toBeVisible()
	expect(
		host.calls.filter((call) => call.path === "clients/unpair").map((call) => call.body)
	).toEqual([{ uuid: "device-1" }])
})

test("rejected unpair stays visible and is not retried automatically", async ({ page }) => {
	const host = await mockHost(page)
	let writes = 0
	await page.route("**/api/clients/unpair", async (route) => {
		writes++
		await route.fulfill({ json: { status: false, error: "Não foi possível revogar." } })
	})
	await page.goto("/pin")
	await page
		.getByRole("button", { name: "Desvincular Dispositivo de exemplo", exact: true })
		.click()
	const dialog = page.getByRole("alertdialog")
	await dialog.getByRole("button", { name: "Confirmar", exact: true }).click()
	await expect(dialog.getByText("Não foi possível revogar.", { exact: true })).toBeVisible()
	expect(host.clients).toHaveLength(1)
	expect(writes).toBe(1)
	await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Editar permissões", exact: true })
	).toBeVisible()
})
