import type { Page } from "@playwright/test"

type Item = Record<string, unknown>
export type MockHost = {
	config: Item
	apps: Item[]
	clients: Item[]
	current: string
	logs: string
	authorized: boolean
	calls: { path: string; method: string; body: Item }[]
}

export async function mockHost(page: Page): Promise<MockHost> {
	const state: MockHost = {
		config: {
			sunshine_name: "Test host",
			port: "49989",
			capture: "wgc",
			headless_mode: "enabled",
			nvenc_preset: "1",
			fallback_mode: "1920x1080x120",
			future_option: "keep-me"
		},
		apps: [
			{
				uuid: "app-1",
				name: "Test Game",
				cmd: "start-test",
				custom_app_flag: "keep",
				"prep-cmd": [],
				"state-cmd": [],
				detached: []
			}
		],
		clients: [
			{
				uuid: "device-1",
				name: "Galaxy S25+",
				perm: 0x03000000,
				connected: false,
				display_mode: "1920x1080x120",
				enable_legacy_ordering: true,
				allow_client_commands: true,
				always_use_virtual_display: false,
				do: [],
				undo: []
			}
		],
		current: "",
		authorized: true,
		logs: "[test]: Info: ready\n[test]: Warning: test warning\n[test]: Error: <script>window.injected=true</script>\n",
		calls: []
	}
	await page.route("**/api/**", async (route) => {
		const path = new URL(route.request().url()).pathname.slice(5)
		const method = route.request().method()
		const parsed: unknown = method === "POST" ? route.request().postDataJSON() : {}
		const body =
			parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Item) : {}
		state.calls.push({ path, method, body })
		const json = (data: unknown) => route.fulfill({ json: data })
		if (path === "configLocale") return json({ locale: "pt_BR" })
		if (path === "login") {
			state.authorized = true
			return route.fulfill({ status: 200 })
		}
		if (!state.authorized) return route.fulfill({ status: 401 })
		if (path === "config" && method === "GET")
			return json({
				...state.config,
				status: true,
				platform: "windows",
				version: "test-build",
				vdisplayStatus: 0
			})
		if (path === "config" && method === "POST") {
			state.config = Object.fromEntries(
				Object.entries(body).map(([key, value]) => [
					key,
					typeof value === "string" ? value : JSON.stringify(value)
				])
			)
			return json({ status: true })
		}
		if (path === "apps" && method === "GET")
			return json({
				apps: state.apps,
				current_app: state.current,
				host_uuid: "test-host",
				host_name: "Test host"
			})
		if (path === "apps" && method === "POST") {
			const item = {
				...body,
				uuid:
					typeof body.uuid === "string" && body.uuid
						? body.uuid
						: `new-app-${state.apps.length}`
			}
			state.apps = [...state.apps.filter((app) => app.uuid !== item.uuid), item]
			return json({ status: true })
		}
		if (path === "apps/reorder") {
			state.apps = (body.order as string[]).map(
				(id) => state.apps.find((app) => app.uuid === id) as Item
			)
			return json({ status: true })
		}
		if (path === "apps/delete") {
			state.apps = state.apps.filter((app) => app.uuid !== body.uuid)
			return json({ status: true })
		}
		if (path === "apps/launch") {
			state.current = String(body.uuid)
			return json({ status: true })
		}
		if (path === "apps/close") {
			state.current = ""
			return json({ status: true })
		}
		if (path === "clients/list")
			return json({ status: true, named_certs: state.clients, platform: "windows" })
		if (path === "clients/update") {
			state.clients = state.clients.map((client) =>
				client.uuid === body.uuid ? { ...client, ...body } : client
			)
			return json({ status: true })
		}
		if (path === "clients/unpair") {
			state.clients = state.clients.filter((client) => client.uuid !== body.uuid)
			return json({ status: true })
		}
		if (path === "clients/unpair-all") {
			state.clients = []
			return json({ status: true })
		}
		if (path === "clients/disconnect") {
			state.clients = state.clients.map((client) =>
				client.uuid === body.uuid ? { ...client, connected: false } : client
			)
			return json({ status: true })
		}
		if (path === "pin") {
			state.clients.push({
				uuid: "paired-test",
				name: body.name || "Paired client",
				perm: 0x03000000,
				connected: false
			})
			return json({ status: true })
		}
		if (path === "otp")
			return json({ status: true, otp: "001234", ip: "192.0.2.1", name: "Test host" })
		if (path === "password") {
			state.authorized = false
			return json({ status: true })
		}
		if (path === "logs") return route.fulfill({ body: state.logs, contentType: "text/plain" })
		if (path === "reset-display-device-persistence") return json({ status: true })
		if (path === "covers/upload")
			return json({ status: true, path: "C:\\test\\covers\\cover.png" })
		if (path === "restart" || path === "quit") return route.abort("connectionreset")
		return route.fulfill({
			status: 404,
			json: { status: false, error: `Unmocked endpoint: ${path}` }
		})
	})
	return state
}
