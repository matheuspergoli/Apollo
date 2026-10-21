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
	"port = 50989\nsunshine_name = CI Apollo\nsystem_tray = disabled\nenable_discovery = disabled\nupnp = disabled\norigin_web_ui_allowed = pc\nheadless_mode = disabled\nignore_encoder_probe_failure = enabled\nmin_log_level = 4\nnvenc_realtime_hags = disabled\nnvenc_latency_over_power = disabled\nnvenc_opengl_vulkan_on_dxgi = disabled\n"
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
		request.setTimeout(3000, () => request.destroy(new Error("Native request timeout")))
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
	const [name, value] = cookie.split("=")
	await context.addCookies([{ name, value, url: base, secure: true, sameSite: "Strict" }])
	const page = await context.newPage()
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
	await page.goto(`${base}/apps`)
	await page.getByRole("button", { name: "Novo aplicativo", exact: true }).click()
	await page.locator("#app-name").fill("Aplicativo CI ç")
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
	await page.reload()
	await page
		.locator('[data-slot="card"]')
		.filter({
			has: page.getByRole("button", { name: "Excluir Aplicativo CI ç", exact: true })
		})
		.getByRole("button", { name: "Editar", exact: true })
		.click()
	await page.locator("#app-name").fill("Aplicativo CI editado ç")
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
	assert.equal(
		(
			await http("/api/login", {
				method: "POST",
				data: { ...credentials, password: "ci-only-new-password" }
			})
		).status,
		200
	)
	console.log(
		"Native Windows integration passed: authenticated React pages/assets, config file roundtrip, application create/edit/delete and unknown-field preservation, no language endpoint/option, UTF-8 credentials, session invalidation."
	)
} finally {
	await browser?.close()
	if (child.exitCode === null) child.kill()
	log.end()
}
