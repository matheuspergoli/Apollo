import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises"
import https from "node:https"
import { dirname, resolve } from "node:path"
import { chromium, expect } from "@playwright/test"
import { assertHostStyles } from "./browser-contract.mjs"
import { assertGlobalArchive } from "./configuration-contract.ts"

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
let restartRequested = false
const browserFailures = []

async function navigate(path) {
	await page.goto(base + path)
	await assertHostStyles(page)
}

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
		// Closing an application also refreshes the runtime library. Give these
		// bounded lifecycle operations the same budget; ordinary reads stay short.
		const libraryOperation =
			method === "POST" &&
			[
				"/api/apps",
				"/api/apps/reorder",
				"/api/apps/delete",
				"/api/apps/launch",
				"/api/apps/close"
			].includes(path)
		request.setTimeout(libraryOperation ? 30_000 : 3000, () =>
			request.destroy(new Error(`Native request timeout: ${method} ${path}`))
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
	assert.equal((await http("/api/window-management")).status, 401)
	assert.equal(
		(await http("/api/window-management/recover", { method: "POST", data: {} })).status,
		401
	)
	const login = await http("/api/login", { method: "POST", data: credentials })
	assert.equal(login.status, 200)
	const cookie = login.headers["set-cookie"]?.[0]?.split(";")[0]
	assert(cookie, "Native login did not issue a session cookie")
	assert(
		cookie.startsWith("apollo_auth_50990="),
		"Authentication must be scoped to the host port"
	)
	assert(login.headers["set-cookie"][0].includes("HttpOnly"))
	assert.equal(
		(
			await http("/api/config", {
				cookie: `auth=another-installation; ${cookie}; apollo_auth_47990=unrelated`
			})
		).status,
		200
	)
	const missingCookie = await http("/api/config", { cookie: `prefix_${cookie}` })
	assert.equal(missingCookie.status, 401)
	assert.equal(missingCookie.json.reason, "cookie_missing")
	const wrongCookie = await http("/api/config", { cookie: "apollo_auth_50990=incorrect" })
	assert.equal(wrongCookie.status, 401)
	assert.equal(wrongCookie.json.reason, "session_mismatch")
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

	// Real authenticated storage and application-save boundaries on this isolated
	// host. The launch below exercises Apollo's executor, not a parallel shell
	// client. It does not start a stream or qualify capture/encoder hardware.
	for (const [path, method] of [
		["/api/scripts", "GET"],
		["/api/scripts", "POST"],
		["/api/scripts/read", "POST"],
		["/api/scripts/delete", "POST"]
	]) {
		assert.equal(
			(await http(path, { method, ...(method === "POST" ? { data: {} } : {}) })).status,
			401
		)
	}
	const scriptsBefore = await http("/api/scripts", { cookie })
	assert.equal(scriptsBefore.status, 200)
	assert.equal(scriptsBefore.json.supported, true)
	const scriptBytes = Buffer.from(
		"\ufeffparam([string]$OutputPath, [string]$Literal)\r\n[IO.File]::WriteAllText($OutputPath, $Literal)\r\n",
		"utf8"
	)
	const pendingScript = { name: "example.ps1", data: scriptBytes.toString("base64") }
	const scriptResult = resolve(work, "managed-script-result.txt")
	const literalArgument = "$literal; & text with spaces"
	const scriptApp = {
		uuid: "f8a87b43-6d25-4a8b-87e1-8e3ca052d327",
		name: "Managed script contract",
		cmd: "",
		"cmd-script": { file: pendingScript, arguments: [scriptResult, literalArgument] },
		"virtual-display": false,
		"use-app-identity": false,
		"exclude-global-prep-cmd": true,
		"exclude-global-state-cmd": true
	}
	const appBytesBefore = await readFile(resolve(home, "config/apps.json"))
	assert.equal(
		(await http("/api/apps", { method: "POST", cookie, data: scriptApp })).status,
		400
	)
	assert.deepEqual(await readFile(resolve(home, "config/apps.json")), appBytesBefore)
	assert.equal(
		(await http("/api/scripts", { cookie })).json.scripts.length,
		scriptsBefore.json.scripts.length
	)
	assert.equal(
		(
			await http("/api/apps", {
				method: "POST",
				cookie,
				data: { ...scriptApp, "scripts-approved": true }
			})
		).status,
		200
	)
	const savedScriptApps = await http("/api/apps", { cookie })
	assert.equal(savedScriptApps.json.scripts_supported, true)
	const savedScriptApp = savedScriptApps.json.apps.find((app) => app.uuid === scriptApp.uuid)
	assert(savedScriptApp)
	assert(!Object.hasOwn(savedScriptApp, "scripts-approved"))
	const scriptReference = savedScriptApp["cmd-script"]
	assert(!Object.hasOwn(scriptReference, "file"))
	const scriptRead = await http("/api/scripts/read", {
		method: "POST",
		cookie,
		data: scriptReference
	})
	assert.equal(scriptRead.status, 200)
	assert.deepEqual(Buffer.from(scriptRead.json.script.data, "base64"), scriptBytes)
	const launchedScript = await http("/api/apps/launch", {
		method: "POST",
		cookie,
		data: { uuid: scriptApp.uuid }
	})
	assert.equal(launchedScript.status, 200, launchedScript.content)
	await expect
		.poll(
			async () => {
				try {
					return await readFile(scriptResult, "utf8")
				} catch (failure) {
					if (failure.code === "ENOENT") return null
					throw failure
				}
			},
			{
				timeout: 10000,
				message: "The managed revision must execute through Apollo with literal arguments"
			}
		)
		.toBe(literalArgument)
	assert.equal(
		(await http("/api/apps/close", { method: "POST", cookie, data: {} })).status,
		200
	)
	const newRevision = await http("/api/scripts", {
		method: "POST",
		cookie,
		data: {
			id: scriptReference.id,
			name: pendingScript.name,
			data: Buffer.from("# New revision\r\n").toString("base64")
		}
	})
	assert.equal(newRevision.status, 200)
	assert.notEqual(newRevision.json.script.revision, scriptReference.revision)
	assert.equal(
		(await http("/api/apps", { cookie })).json.apps.find((app) => app.uuid === scriptApp.uuid)[
			"cmd-script"
		].revision,
		scriptReference.revision
	)
	assert.equal(
		(
			await http("/api/scripts/delete", {
				method: "POST",
				cookie,
				data: { id: scriptReference.id }
			})
		).status,
		400
	)
	assert.equal(
		(
			await http("/api/apps/delete", {
				method: "POST",
				cookie,
				data: { uuid: scriptApp.uuid }
			})
		).status,
		200
	)
	assert.equal(
		(
			await http("/api/scripts/delete", {
				method: "POST",
				cookie,
				data: { id: scriptReference.id }
			})
		).status,
		200
	)
	assert.equal(
		(await http("/api/scripts", { cookie })).json.scripts.length,
		scriptsBefore.json.scripts.length
	)

	// A detached monitor must not block launch or be killed by application close.
	// Its pinned revision must also survive beyond that application's lifetime.
	const detachedStarted = resolve(work, "detached-started.txt")
	const detachedRelease = resolve(work, "detached-release.txt")
	const detachedFinished = resolve(work, "detached-finished.txt")
	const monitorBytes = Buffer.from(
		"param([string]$Started, [string]$Release, [string]$Finished)\r\n[IO.File]::WriteAllText($Started, 'started')\r\n$deadline = [DateTime]::UtcNow.AddSeconds(120)\r\nwhile (-not (Test-Path -LiteralPath $Release) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }\r\nif (-not (Test-Path -LiteralPath $Release)) { exit 2 }\r\n[IO.File]::WriteAllText($Finished, 'finished')\r\n"
	)
	const detachedApp = {
		uuid: "cf41c34a-fb65-465f-9a45-a15ae66b5477",
		name: "Detached monitor contract",
		cmd: "",
		"virtual-display": false,
		"use-app-identity": false,
		"exclude-global-prep-cmd": true,
		"exclude-global-state-cmd": true,
		"scripts-approved": true,
		detached: [
			"cmd.exe /c exit 0",
			{
				cmd: "",
				"cmd-script": {
					file: { name: "monitor.ps1", data: monitorBytes.toString("base64") },
					arguments: [detachedStarted, detachedRelease, detachedFinished]
				}
			}
		]
	}
	assert.equal(
		(await http("/api/apps", { method: "POST", cookie, data: detachedApp })).status,
		200
	)
	const savedDetached = (await http("/api/apps", { cookie })).json.apps.find(
		(app) => app.uuid === detachedApp.uuid
	)
	assert.equal(savedDetached.cmd, "")
	assert.equal(savedDetached.detached[0], detachedApp.detached[0])
	const monitorReference = savedDetached.detached[1]["cmd-script"]
	const monitorPath = resolve(
		home,
		"config/scripts",
		monitorReference.id,
		`${monitorReference.revision}.ps1`
	)
	try {
		assert.equal(
			(
				await http("/api/apps/launch", {
					method: "POST",
					cookie,
					data: { uuid: detachedApp.uuid }
				})
			).status,
			200
		)
		await expect
			.poll(
				async () => {
					try {
						return await readFile(detachedStarted, "utf8")
					} catch (failure) {
						if (failure.code === "ENOENT") return null
						throw failure
					}
				},
				{ timeout: 10000 }
			)
			.toBe("started")
		assert.equal(
			(await http("/api/apps/close", { method: "POST", cookie, data: {} })).status,
			200
		)
		assert.equal(
			(
				await http("/api/apps/delete", {
					method: "POST",
					cookie,
					data: { uuid: detachedApp.uuid }
				})
			).status,
			200
		)
		await assert.rejects(
			async () => {
				const file = await open(monitorPath, "r+")
				await file.close()
			},
			(failure) => ["EBUSY", "EACCES", "EPERM"].includes(failure.code),
			"A running detached script must remain pinned after app close"
		)
		assert.equal(
			(
				await http("/api/scripts/delete", {
					method: "POST",
					cookie,
					data: { id: monitorReference.id }
				})
			).status,
			400
		)
	} finally {
		// Only this test's marker controls this bounded test-owned monitor.
		await writeFile(detachedRelease, "release")
	}
	await expect
		.poll(
			async () => {
				try {
					return await readFile(detachedFinished, "utf8")
				} catch (failure) {
					if (failure.code === "ENOENT") return null
					throw failure
				}
			},
			{
				timeout: 10000,
				message: "Closing Apollo's app must not terminate its detached script"
			}
		)
		.toBe("finished")
	await expect
		.poll(
			async () => {
				try {
					const file = await open(monitorPath, "r+")
					await file.close()
					return true
				} catch (failure) {
					if (["EBUSY", "EACCES", "EPERM"].includes(failure.code)) return false
					throw failure
				}
			},
			{ timeout: 10000, message: "Exited detached scripts must release their revision leases" }
		)
		.toBe(true)
	assert.deepEqual(await readFile(monitorPath), monitorBytes)
	assert.equal(
		(
			await http("/api/scripts/delete", {
				method: "POST",
				cookie,
				data: { id: monitorReference.id }
			})
		).status,
		200
	)

	// Exercise the actual diagnostic log reader, not a parallel file-read mock.
	// Windows text-mode reads can treat SUB (0x1a) as EOF. Generate it through
	// production debug logging on this isolated host and require later records.
	const firstLog = await http("/api/logs", { cookie })
	assert.equal(firstLog.status, 200)
	const controlMarker = "apollo-log-before\u001aapollo-log-after"
	const tailMarker = "apollo-log-later-record"
	assert.equal(
		(await http(`/api/config?log_probe=${encodeURIComponent(controlMarker)}`, { cookie }))
			.status,
		200
	)
	assert.equal((await http(`/api/config?log_probe=${tailMarker}`, { cookie })).status, 200)
	await expect
		.poll(
			async () => {
				const written = await readFile(resolve(home, "config/sunshine.log"), "utf8")
				return written.includes(controlMarker) && written.includes(tailMarker)
			},
			{ timeout: 5000, message: "The isolated host must flush both diagnostic log fixtures" }
		)
		.toBe(true)
	const refreshedLog = await http("/api/logs", { cookie })
	assert.equal(refreshedLog.status, 200)
	assert(refreshedLog.content.includes(controlMarker), "Diagnostic log must not stop at SUB")
	assert(
		refreshedLog.content.includes(tailMarker),
		"A refreshed diagnostic log must include records written after the initial read"
	)
	assert.equal(snapshot.status, 200)
	assert.equal(snapshot.json.status, true)
	assert.equal(
		snapshot.json.vdisplayStatus,
		-1,
		"Without a driver installed, Apollo must not claim virtual display readiness"
	)
	const expectedVersion = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8")
	).version
	assert.equal(
		snapshot.json.version,
		expectedVersion,
		"Native and dashboard release versions must match exactly"
	)
	assert(!Object.hasOwn(snapshot.json, "locale"))
	assert.equal((await http("/api/configLocale", { cookie })).status, 404)
	const before = await readFile(config, "utf8")
	assert.equal(
		(await http("/api/config", { method: "POST", data: { locale: "en" }, cookie })).status,
		400
	)
	assert.equal(await readFile(config, "utf8"), before)
	const windowStatus = await http("/api/window-management", { cookie })
	assert.equal(windowStatus.status, 200)
	assert.equal(windowStatus.json.supported, true)
	assert.equal(windowStatus.json.phase, "disabled")
	assert.equal(windowStatus.json.manual_available, false)
	assert.equal(windowStatus.json.moved, 0)
	assert.equal(windowStatus.json.restored, 0)
	assert.equal(windowStatus.json.generation, 0)
	assert.equal(windowStatus.json.recovery_required, false)
	assert.deepEqual(windowStatus.json.diagnostics, {
		enumeration_failures: 0,
		inspection_failures: 0,
		submission_rejections: 0,
		confirmation_timeouts: 0,
		confirmation_rejections: 0,
		restoration_skips: 0,
		shutdown_unfinished: 0,
		target_failures: 0,
		timeouts_unobserved: 0,
		timeouts_state: 0,
		timeouts_position: 0,
		timeouts_destination: 0,
		last_operation: "none",
		last_reason: "none",
		last_observation: "none",
		last_stage: "none",
		unconfirmed_operation: "none",
		unconfirmed_reason: "none",
		unconfirmed_observation: "none",
		unconfirmed_state: "none",
		unconfirmed_stage: "none",
		unconfirmed_checks: 0,
		unconfirmed_error: 0
	})
	assert(Array.isArray(windowStatus.json.applications))
	const refusedRecovery = await http("/api/window-management/recover", {
		method: "POST",
		data: {},
		cookie
	})
	assert.equal(refusedRecovery.status, 200)
	assert.equal(refusedRecovery.json.status, false)
	for (const data of [
		{ wsm_mode: "enabled" },
		{ wsm_handle_new: "enable1" },
		{ wsm_application_uuid: "Desktop" },
		{ wsm_unknown: "enabled" },
		{ sunshine_name: "example\nwsm_mode = automatic" }
	]) {
		assert.equal((await http("/api/config", { method: "POST", data, cookie })).status, 400)
		assert.equal(
			await readFile(config, "utf8"),
			before,
			"Rejected settings must preserve the complete file"
		)
	}

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
		await navigate(path)
		await page.getByRole("heading", { name: heading, exact: true }).waitFor()
	}
	await navigate("/config")
	await page.locator("#sunshine_name").fill("Teste nativo ç")
	await page.getByRole("button", { name: "Revisar e salvar" }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await page.getByRole("status").filter({ hasText: "Arquivo salvo" }).waitFor()
	assert.match(await readFile(config, "utf8"), /sunshine_name = Teste nativo ç/)
	await navigate("/config?section=nv")
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
	assertGlobalArchive(globalFiles, "saved")
	const globalConfiguration = JSON.parse(
		strFromU8(globalFiles["apollo-configuracao/configuracao.json"])
	)
	assert.equal(globalConfiguration.kind, "saved")
	assert.equal(globalConfiguration.sections.general.sunshine_name, "Teste global ç")
	assert.equal(globalConfiguration.sections.nv.nvenc_preset, 4)
	assert.equal(globalConfiguration.sections.network.port, 50989)
	assert(
		!Object.hasOwn(globalConfiguration.sections, "vt"),
		"Removed encoder section must not be exported"
	)
	assert(
		globalConfiguration.sections.vaapi,
		"Linux encoder configuration must remain exportable"
	)
	await navigate("/apps")
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
	await navigate("/config?section=window-session")
	await page.getByRole("combobox", { name: "Aplicativo da sessão Desktop" }).click()
	await page
		.getByRole("option", { name: `Aplicativo CI ç (${entry.uuid})`, exact: true })
		.click()
	await page.getByRole("switch", { name: "Restaurar posições ao encerrar" }).click()
	await page.getByRole("button", { name: "Revisar e salvar", exact: true }).click()
	await page.getByRole("button", { name: "Salvar arquivo", exact: true }).click()
	await page.getByRole("status").filter({ hasText: "Arquivo salvo" }).waitFor()
	const windowConfiguration = await readFile(config, "utf8")
	assert(windowConfiguration.includes(`wsm_application_uuid = ${entry.uuid}`))
	assert.match(windowConfiguration, /wsm_restore_positions = disabled/)
	assert.match(windowConfiguration, /port = 50989/)
	assert.match(windowConfiguration, /nvenc_preset = 4/)
	assert.match(windowConfiguration, /sunshine_name = Teste global ç/)
	assert.equal(await page.getByRole("button", { name: "Recuperar janelas agora" }).count(), 0)
	await navigate("/troubleshooting")
	await page
		.getByRole("region", { name: "Estado do gerenciamento de janelas" })
		.getByText(/Geração 0\./)
		.waitFor()
	assert(await page.getByRole("button", { name: "Recuperar janelas agora" }).isDisabled())
	const inactiveWindows = (await http("/api/window-management", { cookie })).json
	assert.equal(inactiveWindows.manual_available, false)
	assert.equal(inactiveWindows.moved, 0, "Saving a selection must not move any window")
	// This is already a fresh document after the settings/diagnostics visits.
	// Do not reload it immediately while route assets may still be loading.
	await navigate("/apps")
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
	await page.getByRole("button", { name: "Atualizar aplicativos", exact: true }).click()
	await page.getByRole("status").filter({ hasText: "Entre novamente" }).waitFor()
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
		.filter({ hasText: "Entre novamente" })
		.waitFor({ state: "hidden" })
	assert(await page.getByRole("button", { name: "Reiniciar host", exact: true }).isEnabled())
	assert.equal(child.exitCode, null, "Renewing a session must not replay the restart")
	assert.deepEqual(errors, [])
	const nativeLog = await readFile(resolve(process.cwd(), "native-test.log"), "utf8")
	assert(
		!nativeLog.includes(cookie.slice(cookie.indexOf("=") + 1)),
		"Debug logs must not expose the session cookie"
	)
	assert(
		!nativeLog.includes(renewedCookie.slice(renewedSeparator + 1)),
		"Debug logs must not expose the renewed session cookie"
	)
	// Exercise the actual authenticated browser action, not a mocked restart.
	// This is permitted only in the isolated fork runner guarded above.
	await page.getByRole("button", { name: "Reiniciar host", exact: true }).click()
	restartRequested = true
	// Read the response immediately: the UI can navigate before click() resolves.
	const acknowledgementReady = page
		.waitForResponse(
			(response) =>
				response.url().endsWith("/api/restart") && response.request().method() === "POST"
		)
		.then(async (response) => {
			assert(
				Number(response.headers()["content-length"]) > 0,
				"Restart acknowledgement must be length-framed, not wait for shutdown EOF"
			)
			return { status: response.status(), body: await response.json() }
		})
	const [acknowledgement] = await Promise.all([
		acknowledgementReady,
		page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Confirmar", exact: true })
			.click()
	])
	assert.equal(
		acknowledgement.status,
		200,
		"Restart must acknowledge before closing its HTTP connection"
	)
	assert.deepEqual(acknowledgement.body, {
		status: true,
		accepted: true,
		operation: "restart"
	})
	// Bound process shutdown separately from HTTP delivery. An accepted POST is
	// insufficient: require a normal exit and a responding replacement process.
	for (let attempt = 0; attempt < 1200 && child.exitCode === null; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	assert.equal(
		child.exitCode,
		0,
		"A newly authenticated browser restart must exit the original host successfully"
	)
	let returned = false
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			// A new process has no administrative session. Require its endpoint to
			// respond after the original PID exited; exit alone is not a restart.
			if ((await http("/api/config")).status === 401) {
				returned = true
				break
			}
		} catch {
			/* Startup can temporarily leave the port unavailable. */
		}
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
	assert(returned, "Restart must return an operational HTTP endpoint, not only exit")
	const replacementPids = JSON.parse(
		execFileSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:APOLLO_TEST_EXECUTABLE } | Select-Object -ExpandProperty ProcessId)"
			],
			{
				env: { ...process.env, APOLLO_TEST_EXECUTABLE: resolve(home, "sunshine.exe") },
				encoding: "utf8"
			}
		)
	)
	assert.equal(replacementPids.length, 1, "Exactly one replacement host must be running")
	assert.notEqual(replacementPids[0], child.pid, "Restart must create a new host process")
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
	if (restartRequested) {
		execFileSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:APOLLO_TEST_EXECUTABLE } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
			],
			{ env: { ...process.env, APOLLO_TEST_EXECUTABLE: resolve(home, "sunshine.exe") } }
		)
	}
	if (child.exitCode === null) child.kill()
	log.end()
}
