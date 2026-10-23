import { expect, test } from "@playwright/test"
import { mockHost } from "../fixtures/mock-api"

test("malformed cover success without a stored path retains the current image path", async ({
	page
}) => {
	await mockHost(page)
	await page.route("**/api/covers/upload", (route) =>
		route.fulfill({ json: { status: true } })
	)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-image-path").fill("C:\\keep.png")
	const upload = page.getByLabel("Enviar capa PNG", { exact: true })
	await upload.setInputFiles({
		name: "cover.png",
		mimeType: "image/png",
		buffer: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1kAAAAASUVORK5CYII=",
			"base64"
		)
	})
	await expect(page.getByRole("alert")).toContainText("não informou o caminho")
	await expect(page.locator("#app-image-path")).toHaveValue("C:\\keep.png")
})

test("online cover search runs on demand and selection updates only the draft", async ({
	page
}) => {
	const host = await mockHost(page)
	const lookups: string[] = []
	await page.route(
		"https://raw.githubusercontent.com/LizardByte/GameDB/gh-pages/**",
		async (route) => {
			const path = new URL(route.request().url()).pathname
			lookups.push(path)
			if (path.endsWith("/buckets/te.json"))
				return route.fulfill({ json: { "123": { name: "Test Game" } } })
			if (path.endsWith("/games/123.json"))
				return route.fulfill({
					json: {
						name: "Test Game",
						cover: { url: "//images.igdb.com/igdb/image/upload/t_thumb/cover123.jpg" }
					}
				})
			return route.fulfill({ status: 404 })
		}
	)
	await page.route("https://images.igdb.com/**", (route) => route.fulfill({ status: 204 }))
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	expect(lookups).toEqual([])
	await page.getByRole("button", { name: "Buscar capas online", exact: true }).click()
	const dialog = page.getByRole("dialog")
	await dialog.getByRole("button", { name: /Test Game/ }).click()
	await expect(dialog).toBeHidden()
	await expect(page.locator("#app-image-path")).toHaveValue("C:\\test\\covers\\cover.png")
	expect(lookups).toHaveLength(2)
	expect(
		host.calls.filter((call) => call.path === "covers/upload").map((call) => call.body)
	).toEqual([
		{
			key: "igdb_123",
			url: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover123.png"
		}
	])
	expect(host.calls.some((call) => call.path === "apps" && call.method === "POST")).toBe(false)
})

test("failed online cover lookup leaves the existing path intact", async ({ page }) => {
	const host = await mockHost(page)
	await page.route(
		"https://raw.githubusercontent.com/LizardByte/GameDB/gh-pages/**",
		(route) => route.fulfill({ status: 503 })
	)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	await page.locator("#app-image-path").fill("C:\\existing.png")
	await page.getByRole("button", { name: "Buscar capas online", exact: true }).click()
	const dialog = page.getByRole("dialog")
	await expect(
		dialog.getByText("Não foi possível consultar o catálogo de capas.", { exact: true })
	).toBeVisible()
	await dialog.getByRole("button", { name: "Fechar", exact: true }).click()
	await expect(page.locator("#app-image-path")).toHaveValue("C:\\existing.png")
	expect(host.calls.some((call) => call.path === "covers/upload")).toBe(false)
})

test("creating an application writes only on save and search filters the new entry", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Novo aplicativo", exact: true }).click()
	await page.locator("#app-name").fill("Novo jogo ç")
	await page.locator("#app-cmd").fill("C:\\Jogos\\novo.exe")
	expect(host.apps).toHaveLength(1)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await expect(page.getByRole("heading", { name: "Aplicativos", exact: true })).toBeVisible()
	expect(host.apps).toHaveLength(2)
	await page
		.getByRole("textbox", { name: "Buscar aplicativos", exact: true })
		.fill("novo jogo")
	await expect(
		page.getByRole("button", { name: "Excluir Novo jogo ç", exact: true })
	).toBeVisible()
	await expect(
		page.getByRole("button", { name: "Excluir Test Game", exact: true })
	).toHaveCount(0)
	expect(host.calls.some((call) => call.path === "apps/launch")).toBe(false)
})

test("launcher export and deep link carry the selected host/application IDs", async ({
	page
}) => {
	await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Abrir no Artemis", exact: true }).click()
	const href = await page
		.getByRole("link", { name: "Abrir Artemis neste dispositivo", exact: true })
		.getAttribute("href")
	const link = new URL(href || "")
	expect(link.protocol).toBe("art:")
	expect(link.searchParams.get("host_uuid")).toBe("test-host")
	expect(link.searchParams.get("app_uuid")).toBe("app-1")
	await expect(page.getByRole("dialog")).toContainText("Não envia um comando do PC")
	await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click()
	const downloadReady = page.waitForEvent("download")
	await page.getByRole("button", { name: "Exportar .art", exact: true }).click()
	const download = await downloadReady
	expect(download.suggestedFilename()).toBe("Test Game.art")
	const stream = await download.createReadStream()
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	const content = Buffer.concat(chunks).toString("utf8")
	expect(content).toContain("[host_uuid] test-host")
	expect(content).toContain("[app_uuid] app-1")
})

test("invalid cover never uploads; valid PNG updates the draft without saving the app", async ({
	page
}) => {
	const host = await mockHost(page)
	await page.goto("/apps")
	await page.getByRole("button", { name: "Editar", exact: true }).click()
	const upload = page.getByLabel("Enviar capa PNG", { exact: true })
	await upload.setInputFiles({
		name: "bad.png",
		mimeType: "image/png",
		buffer: Buffer.from("not PNG")
	})
	await expect(
		page.getByText("O arquivo deve ser uma imagem PNG válida.", { exact: true })
	).toBeVisible()
	expect(host.calls.some((call) => call.path === "covers/upload")).toBe(false)
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1kAAAAASUVORK5CYII=",
		"base64"
	)
	await upload.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png })
	await expect(page.locator("#app-image-path")).toHaveValue("C:\\test\\covers\\cover.png")
	const writes = host.calls.filter((call) => call.path === "covers/upload")
	expect(writes).toHaveLength(1)
	expect(writes[0]?.body.data).toBe(png.toString("base64"))
	expect(host.calls.some((call) => call.path === "apps" && call.method === "POST")).toBe(false)
})
