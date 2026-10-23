import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, parseConfig, post, request } from "./api"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("host API boundary", () => {
	it("only calls a session expired when the backend confirms expiry", async () => {
		for (const reason of [
			"session_missing",
			"cookie_missing",
			"session_mismatch",
			"session_expired"
		]) {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue(new Response(JSON.stringify({ reason }), { status: 401 }))
			)
			await expect(post("restart", {}, false)).rejects.toMatchObject({
				status: 401,
				reason,
				message:
					reason === "session_expired"
						? "A sessão expirou. Entre novamente."
						: "Acesso não autorizado. Entre novamente para continuar."
			})
		}
	})
	it("allows bounded native library refresh time without extending unrelated requests", async () => {
		const timeout = vi.spyOn(AbortSignal, "timeout")
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => Promise.resolve(new Response('{"status":true}')))
		)
		for (const path of ["apps", "apps/reorder", "apps/delete"]) {
			await post(path, {})
			expect(timeout).toHaveBeenLastCalledWith(30_000)
		}
		await request("apps")
		expect(timeout).toHaveBeenLastCalledWith(10_000)
		await post("restart", {}, false)
		expect(timeout).toHaveBeenLastCalledWith(10_000)
	})
	it("uses same-origin credentials, explicit JSON and no-store", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
		vi.stubGlobal("fetch", fetcher)
		await post("login", { username: "test", password: "test-only" }, false)
		const [path, options] = fetcher.mock.calls[0]
		expect(path).toBe("/api/login")
		expect(options).toMatchObject({
			credentials: "same-origin",
			cache: "no-store",
			method: "POST"
		})
		expect(options.headers["Content-Type"]).toBe("application/json")
		expect(options.signal).toBeInstanceOf(AbortSignal)
	})
	it("does not interpret empty login success as invalid JSON", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
		await expect(post("login", {}, false)).resolves.toBeUndefined()
	})
	it("preserves HTTP status without leaking credentials", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
		await expect(post("login", { password: "test-only" }, false)).rejects.toBeInstanceOf(
			ApiError
		)
		await expect(post("login", {}, false)).rejects.toMatchObject({ status: 401 })
	})
	it("explains offline, timeout and unexpected HTML responses", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))
		await expect(request("config")).rejects.toThrow("conectar")
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"))
		)
		await expect(request("config")).rejects.toThrow("demorou")
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>")))
		await expect(request("config")).rejects.toThrow("Resposta inválida")
	})
	it("propagates query cancellation rather than pretending the host failed", async () => {
		const controller = new AbortController()
		controller.abort()
		vi.stubGlobal(
			"fetch",
			vi.fn((_path, options) => Promise.reject(options.signal.reason))
		)
		await expect(request("config", { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError"
		})
	})
	it("does not recommend repeating a write whose outcome is unknown after timeout", async () => {
		const fetcher = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"))
		vi.stubGlobal("fetch", fetcher)
		await expect(post("apps", { name: "Teste" })).rejects.toThrow("Ela pode ter sido aplicada")
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
})

describe("safe configuration cache", () => {
	it("rejects invalid or failed responses", () => {
		for (const value of [undefined, null, [], {}, { status: false }, { status: "true" }]) {
			expect(() => parseConfig(value)).toThrow()
		}
	})
	it("only retains explicitly allowed non-secret fields", () => {
		expect(
			parseConfig({
				status: true,
				version: "test",
				password: "test-only",
				pkey: "/private",
				extra: true
			})
		).toEqual({ version: "test" })
	})
	it("does not fabricate settings or coerce wrong types", () => {
		expect(parseConfig({ status: true, capture: {}, nvenc_preset: 1 })).toEqual({})
	})
})
