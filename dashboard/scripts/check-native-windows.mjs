import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import https from "node:https"
import { dirname, resolve } from "node:path"
import { chromium } from "@playwright/test"

if (
	process.platform !== "win32" ||
	process.env.GITHUB_ACTIONS !== "true" ||
	process.env.GITHUB_REPOSITORY !== "matheuspergoli/Apollo"
) {
	throw new Error(
		"Este ensaio inicia um host isolado e só pode executar no runner Windows deste fork."
	)
}
const archive = resolve(process.argv[2])
const work = await mkdtemp(resolve(process.env.RUNNER_TEMP, "apollo-native-"))
execFileSync(
	"powershell.exe",
	[
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		"Expand-Archive -LiteralPath $env:APOLLO_TEST_ZIP -DestinationPath $env:APOLLO_TEST_DEST"
	],
	{ env: { ...process.env, APOLLO_TEST_ZIP: archive, APOLLO_TEST_DEST: work } }
)
const home = resolve(work, "Apollo")
const config = resolve(home, "config/sunshine.conf")
await mkdir(dirname(config), { recursive: true })
await writeFile(
	config,
	"port = 50989\nsunshine_name = CI Apollo\nsystem_tray = disabled\nenable_discovery = disabled\nupnp = disabled\norigin_web_ui_allowed = pc\nheadless_mode = disabled\nignore_encoder_probe_failure = enabled\nmin_log_level = 0\nnvenc_realtime_hags = disabled\nnvenc_latency_over_power = disabled\nnvenc_opengl_vulkan_on_dxgi = disabled\n"
)
const base = "https://127.0.0.1:50990"
const log = createWriteStream(resolve(process.cwd(), "native-test.log"))
const child = spawn(resolve(home, "sunshine.exe"), [config], {
	cwd: home,
	windowsHide: true,
	stdio: ["ignore", "pipe", "pipe"]
})
child.stdout.pipe(log, { end: false })
child.stderr.pipe(log, { end: false })
let browser
let page
const browserFailures = []

function http(path, { method = "GET", data, cookie } = {}) {
	return new Promise((resolveResult, reject) => {
		const body = data === undefined ? undefined : JSON.stringify(data)
		const headers = {
			...(body
				? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
				: {}),
			...(cookie ? { Cookie: cookie } : {})
		}
		const request = https.request(
			base + path,
			{ method, headers, rejectUnauthorized: false },
			(response) => {
				let content = ""
				response.setEncoding("utf8")
				response.on("data", (chunk) => {
					content += chunk
				})
				response.on("end", () => {
					let json
					try {
						json = JSON.parse(content)
					} catch {
						/* HTML and empty login responses are valid for their endpoints. */
					}
					resolveResult({
						status: response.statusCode,
						headers: response.headers,
						content,
						json
					})
				})
			}
		)
		const libraryWrite =
			method === "POST" &&
			["/api/apps", "/api/apps/reorder", "/api/apps/delete"].includes(path)
		request.setTimeout(libraryWrite ? 30_000 : 3000, () =>
			request.destroy(new Error("Native request timeout"))
		)
		request.on("error", reject)
		request.end(body)
	})
}

try {
	let ready = false
	for (let attempt = 0; attempt < 120; attempt++) {
		if (child.exitCode !== null)
			throw new Error(`Host exited before readiness (${child.exitCode})`)
		try {
			if ((await http("/welcome")).status === 200) {
				ready = true
				break
			}
		} catch {
			/* Wait only for this newly spawned runner-local process. */
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 1000))
	}
	assert(ready, "Native UI did not become ready")
	assert.equal((await http("/api/config")).status, 307)
	const credentials = { username: "ci-only-user", password: "ci-only-password-ç" }
	const created = await http("/api/password", {
		method: "POST",
		data: {
			newUsername: credentials.username,
			newPassword: credentials.password,
			confirmNewPassword: credentials.password
		}
	})
	assert.equal(created.status, 200)
	assert.equal(created.json.status, true)
	assert.equal((await http("/api/config")).status, 401)
	const login = await http("/api/login", { method: "POST", data: credentials })
	assert.equal(login.status, 200)
	const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0]
	assert(cookie, "Native login did not issue a session cookie")
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1kAAAAASUVORK5CYII=",
		"base64"
	)
	const uploadedCover = await http("/api/covers/upload", {
		method: "POST",
		cookie,
		data: { key: "ci_binary_cover", data: png.toString("base64") }
	})
	assert.equal(uploadedCover.status, 200)
	assert.equal(uploadedCover.json.status, true)
	assert.deepEqual(
		await readFile(uploadedCover.json.path),
		png,
		"Uploaded PNG must remain byte-identical on Windows"
	)
	assert.equal(
		(
			await http("/api/covers/upload", {
				method: "POST",
				cookie,
				data: { key: "ci_binary_cover", data: Buffer.from("not-png").toString("base64") }
			})
		).status,
		400
	)
	assert.deepEqual(
		await readFile(uploadedCover.json.path),
		png,
		"Rejected upload must not overwrite a valid PNG"
	)
	const snapshot = await http("/api/config", { cookie })
	assert.equal(snapshot.status, 200)
	assert.equal(snapshot.json.status, true)
	assert(!Object.hasOwn(snapshot.json, "locale"))
	assert.equal((await http("/api/configLocale", { cookie })).status, 404)
	const before = await readFile(config, "utf8")
	assert.equal(
		(await http("/api/config", { method: "POST", data: { locale: "en" }, cookie })).status,
		400
	)
	assert.equal(await readFile(config, "utf8"), before)

	browser = await chromium.launch({ headless: true })
	const context = await browser.newContext({ ignoreHTTPSErrors: true })
	// Native session tokens may themselves contain '='. Split only at the first one.
	const separator = cookie.indexOf("=")
	const name = cookie.slice(0, separator)
	const value = cookie.slice(separator + 1)
	assert.equal(`${name}=${value}`, cookie)
	await context.addCookies([{ name, value, url: base, secure: true, sameSite: "Strict" }])
	assert.equal(
		(await context.request.get(`${base}/api/config`)).status(),
		200,
		"Browser context must retain the complete native session token"
	)
	page = await context.newPage()
	page.on("requestfailed", (request) =>
		browserFailures.push({
			path: new URL(request.url()).pathname,
			error: request.failure()?.errorText
		})
	)
	page.on("response", (response) => {
		if (response.status() >= 400)
			browserFailures.push({
				path: new URL(response.url()).pathname,
				status: response.status()
			})
	})
	const errors = []
	page.on("pageerror", (error) => errors.push(error.message))
	for (const [path, heading] of [
		["/", "Visão geral"],
		["/pin", "Dispositivos"],
		["/apps", "Aplicativos"],
		["/config", "Configurações"],
		["/password", "Acesso e senha"],
		["/troubleshooting", "Diagnóstico"]
	]) {
		await page.goto(base + path)
		await page.getByRole("heading", { name: heading, exact: true }).waitFor()
	}
	await page.goto(`${base}/config`)
	await page.locator("#sunshine_name").fill("Teste nativo ç")
	await page.getByRole("button", { name: "Revisar e salvar" }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await page.getByRole("status").filter({ hasText: "Arquivo salvo" }).waitFor()
	assert.match(await readFile(config, "utf8"), /sunshine_name = Teste nativo ç/)
	await page.goto(`${base}/config?section=nv`)
	await page.getByLabel("Arquivo JSON da seção", { exact: true }).setInputFiles({
		name: "nv-native.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-settings-section",
				version: 1,
				section: "nv",
				settings: { nvenc_preset: 3 }
			})
		)
	})
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Aplicar ao rascunho", exact: true })
		.click()
	assert.doesNotMatch(await readFile(config, "utf8"), /nvenc_preset = 3/)
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await page.getByRole("status").filter({ hasText: "Arquivo salvo" }).waitFor()
	assert.match(await readFile(config, "utf8"), /nvenc_preset = 3/)
	assert.match(await readFile(config, "utf8"), /sunshine_name = Teste nativo ç/)
	await page.getByLabel("Arquivo JSON global", { exact: true }).setInputFiles({
		name: "global-native.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-settings",
				version: 1,
				kind: "saved",
				platform: "windows",
				sections: { general: { sunshine_name: "Teste global ç" }, nv: { nvenc_preset: 4 } }
			})
		)
	})
	await page
		.getByRole("dialog", { name: "Revisar importação global", exact: true })
		.getByRole("button", { name: "Aplicar tudo ao rascunho", exact: true })
		.click()
	assert.match(await readFile(config, "utf8"), /sunshine_name = Teste nativo ç/)
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await page.getByRole("status").filter({ hasText: "Arquivo salvo" }).waitFor()
	assert.match(await readFile(config, "utf8"), /sunshine_name = Teste global ç/)
	assert.match(await readFile(config, "utf8"), /nvenc_preset = 4/)
	assert.match(await readFile(config, "utf8"), /port = 50989/)
	await page
		.getByRole("button", { name: "Exportar configurações salvas", exact: true })
		.click()
	const globalDownloadReady = page.waitForEvent("download")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	const globalDownload = await globalDownloadReady
	const globalDownloadPath = await globalDownload.path()
	assert(globalDownloadPath, "Global configuration ZIP was not downloaded")
	const { unzipSync, strFromU8 } = await import("fflate")
	const globalFiles = unzipSync(await readFile(globalDownloadPath))
	const globalConfiguration = JSON.parse(
		strFromU8(globalFiles["apollo-configuracao/configuracao.json"])
	)
	assert.equal(globalConfiguration.kind, "saved")
	assert.equal(globalConfiguration.sections.general.sunshine_name, "Teste global ç")
	assert.equal(globalConfiguration.sections.nv.nvenc_preset, 4)
	assert.equal(globalConfiguration.sections.network.port, 50989)
	assert.equal(Object.keys(globalConfiguration.sections).length, 12)
	await page.goto(`${base}/apps`)
	await page.getByRole("button", { name: "Novo aplicativo", exact: true }).click()
	const createFile = page.getByLabel("Arquivo JSON do aplicativo", { exact: true })
	await createFile.setInputFiles({
		name: "application-native.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-application",
				version: 1,
				kind: "application",
				application: { name: "Aplicativo CI ç", cmd: "" }
			})
		)
	})
	await page
		.getByRole("dialog", { name: "Revisar importação de aplicativo", exact: true })
		.getByRole("button", { name: "Aplicar ao rascunho", exact: true })
		.click()
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await page.getByRole("button", { name: "Excluir Aplicativo CI ç", exact: true }).waitFor()
	const library = await http("/api/apps", { cookie })
	assert.equal(library.status, 200)
	const entry = library.json.apps.find((app) => app.name === "Aplicativo CI ç")
	assert(entry?.uuid, "Native application creation did not persist a UUID")
	assert.equal(
		(
			await http("/api/apps", {
				method: "POST",
				cookie,
				data: { ...entry, ci_unknown_field: "preserve" }
			})
		).json.status,
		true
	)
	await page.getByRole("button", { name: "Atualizar aplicativos", exact: true }).click()
	await page
		.locator('[data-slot="card"]')
		.filter({
			has: page.getByRole("button", { name: "Excluir Aplicativo CI ç", exact: true })
		})
		.getByRole("button", { name: "Editar", exact: true })
		.click()
	const editFile = page.getByLabel("Arquivo JSON do aplicativo", { exact: true })
	await editFile.setInputFiles({
		name: "application-native-edit.json",
		mimeType: "application/json",
		buffer: Buffer.from(
			JSON.stringify({
				format: "apollo-application",
				version: 1,
				kind: "application",
				application: { name: "Aplicativo CI editado ç" }
			})
		)
	})
	await page
		.getByRole("dialog", { name: "Revisar importação de aplicativo", exact: true })
		.getByRole("button", { name: "Aplicar ao rascunho", exact: true })
		.click()
	assert(
		(await http("/api/apps", { cookie })).json.apps.some(
			(app) => app.uuid === entry.uuid && app.name === "Aplicativo CI ç"
		),
		"Import must not save or replace identity before explicit save"
	)
	await page
		.getByRole("button", { name: "Exportar aplicativo do editor", exact: true })
		.click()
	const applicationDownloadReady = page.waitForEvent("download")
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	const applicationDownloadPath = await (await applicationDownloadReady).path()
	assert(applicationDownloadPath, "Application configuration ZIP was not downloaded")
	const applicationFiles = unzipSync(await readFile(applicationDownloadPath))
	const applicationConfiguration = JSON.parse(
		strFromU8(applicationFiles["apollo-aplicativo/aplicativo.json"])
	)
	assert.equal(applicationConfiguration.application.name, "Aplicativo CI editado ç")
	assert(!Object.hasOwn(applicationConfiguration.application, "uuid"))
	assert(!Object.hasOwn(applicationConfiguration.application, "ci_unknown_field"))
	assert(
		applicationFiles["apollo-aplicativo/schema.json"],
		"Application schema was not exported"
	)
	await page.getByRole("button", { name: "Salvar aplicativo", exact: true }).click()
	await page
		.getByRole("button", { name: "Excluir Aplicativo CI editado ç", exact: true })
		.waitFor()
	const updatedLibrary = await http("/api/apps", { cookie })
	const updatedEntry = updatedLibrary.json.apps.find((app) => app.uuid === entry.uuid)
	assert.equal(updatedEntry?.name, "Aplicativo CI editado ç")
	assert.equal(updatedEntry?.ci_unknown_field, "preserve")
	await page
		.getByRole("button", { name: "Excluir Aplicativo CI editado ç", exact: true })
		.click()
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Confirmar", exact: true })
		.click()
	await page.getByRole("alertdialog").waitFor({ state: "hidden" })
	assert(
		!(await http("/api/apps", { cookie })).json.apps.some((app) => app.uuid === entry.uuid)
	)
	assert.deepEqual(errors, [])

	const changed = await http("/api/password", {
		method: "POST",
		cookie,
		data: {
			currentUsername: credentials.username,
			currentPassword: credentials.password,
			newUsername: credentials.username,
			newPassword: "ci-only-new-password",
			confirmNewPassword: "ci-only-new-password"
		}
	})
	assert.equal(changed.status, 200)
	assert.equal(changed.json.status, true)
	assert.equal((await http("/api/config", { cookie })).status, 401)
	assert.equal((await http("/api/restart", { method: "POST", cookie, data: {} })).status, 401)
	assert.equal(child.exitCode, null, "An unauthorized restart must not stop the host")
	await page.reload()
	await page.getByRole("status").filter({ hasText: "Sessão expirada" }).waitFor()
	assert(await page.getByRole("button", { name: "Reiniciar host", exact: true }).isDisabled())
	const reauthenticated = await http("/api/login", {
		method: "POST",
		data: { ...credentials, password: "ci-only-new-password" }
	})
	assert.equal(reauthenticated.status, 200)
	const renewedCookie = reauthenticated.headers["set-cookie"]?.[0]?.split(";")[0]
	assert(renewedCookie)
	const renewedSeparator = renewedCookie.indexOf("=")
	await context.addCookies([
		{
			name: renewedCookie.slice(0, renewedSeparator),
			value: renewedCookie.slice(renewedSeparator + 1),
			url: base,
			secure: true,
			sameSite: "Strict"
		}
	])
	await page.getByRole("button", { name: "Verificar sessão", exact: true }).click()
	await page
		.getByRole("status")
		.filter({ hasText: "Sessão expirada" })
		.waitFor({ state: "hidden" })
	assert(await page.getByRole("button", { name: "Reiniciar host", exact: true }).isEnabled())
	assert.equal(child.exitCode, null, "Renewing a session must not replay the restart")
	assert.deepEqual(errors, [])
	console.log(
		"Native Windows integration passed: authenticated React pages/assets, config/application roundtrips, PNG bytes, session invalidation/recovery and rejection of unauthorized restart without replay."
	)
} catch (error) {
	await writeFile(
		"native-browser-diagnostics.json",
		JSON.stringify(
			{ url: page?.url(), failures: browserFailures, error: String(error) },
			null,
			2
		)
	)
	if (page) {
		await page
			.screenshot({ path: "native-browser-failure.png", fullPage: true })
			.catch(() => {})
		await writeFile("native-browser-failure.html", await page.content().catch(() => ""))
	}
	throw error
} finally {
	await browser?.close()
	if (child.exitCode === null) child.kill()
	log.end()
}
