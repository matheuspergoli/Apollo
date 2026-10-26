import { afterEach, expect, it, vi } from "vitest"
import { ApiError } from "./api"
import { configuredWebAddress, requestLifecycle } from "./lifecycle"

afterEach(() => vi.unstubAllGlobals())

it("reports restart connection loss as uncertain and sends no retry", async () => {
	const fetcher = vi.fn().mockRejectedValue(new TypeError("reset"))
	vi.stubGlobal("fetch", fetcher)
	await expect(requestLifecycle("restart")).resolves.toContain("Isso não confirma")
	expect(fetcher).toHaveBeenCalledTimes(1)
})

it("keeps explicit authentication rejection as an error", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
	await expect(requestLifecycle("restart")).rejects.toBeInstanceOf(ApiError)
})

it("only says a successful request was sent, not that restart completed", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValue(Response.json({ status: true, accepted: true, operation: "restart" }))
	)
	await expect(requestLifecycle("restart")).resolves.toContain("Solicitação enviada")
})

it.each([
	null,
	{ status: true },
	{ status: true, accepted: false, operation: "restart" },
	{ status: true, accepted: true, operation: "quit" }
])("does not confirm an invalid restart acknowledgement: %j", async (body) => {
	const fetcher = vi.fn().mockResolvedValue(Response.json(body))
	vi.stubGlobal("fetch", fetcher)
	await expect(requestLifecycle("restart")).resolves.toContain("Isso não confirma")
	expect(fetcher).toHaveBeenCalledTimes(1)
})

it("does not report success from headers when the acknowledgement body is truncated", async () => {
	const fetcher = vi.fn().mockResolvedValue(new Response('{"status":'))
	vi.stubGlobal("fetch", fetcher)
	await expect(requestLifecycle("restart")).resolves.toContain("Isso não confirma")
	expect(fetcher).toHaveBeenCalledTimes(1)
})

it("keeps quit compatible with an empty response", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
	await expect(requestLifecycle("quit")).resolves.toContain("Solicitação enviada")
})

it("calculates configured web ports without changing the hostname or scheme", () => {
	expect(configuredWebAddress(47989, "https://localhost:50990")).toBe(
		"https://localhost:47990"
	)
	expect(configuredWebAddress("50989", "https://[::1]:47990")).toBe("https://[::1]:50990")
	for (const value of [0, 65535, "bad", 1.5])
		expect(configuredWebAddress(value, "https://localhost")).toBeNull()
})
