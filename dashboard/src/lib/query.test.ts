import { expect, it } from "vitest"
import { createQueryClient } from "./query"

it("does not replay host requests on focus or retry state-changing operations", () => {
	const client = createQueryClient()
	expect(client.getDefaultOptions().queries).toMatchObject({
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: 15_000
	})
	expect(client.getDefaultOptions().mutations).toMatchObject({ retry: false, gcTime: 0 })
	client.clear()
})

it("uses independent caches rather than sharing authenticated data between app instances", () => {
	const first = createQueryClient()
	const second = createQueryClient()
	first.setQueryData(["host", "config-file"], { version: "test" })
	expect(second.getQueryData(["host", "config-file"])).toBeUndefined()
	first.clear()
	second.clear()
})
