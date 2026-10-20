import { expect, it } from "vitest"
import { deviceDraft, pairingLink, permissions, serializeDevice } from "./model"

it("retains all 13 permission bits without broadening a renamed client's access", () => {
	expect(permissions).toHaveLength(13)
	const original = {
		uuid: "device-1",
		name: "Phone",
		perm: 0x03000100,
		display_mode: "1920x1080x59.94",
		do: [{ cmd: "connect", elevated: "false" }],
		undo: []
	}
	const draft = deviceDraft(original)
	draft.name = "Renamed"
	const payload = serializeDevice(draft)
	expect(payload.perm).toBe(original.perm)
	expect(payload.display_mode).toBe(original.display_mode)
	expect(payload.do).toEqual([{ cmd: "connect", elevated: false }])
	expect(original.name).toBe("Phone")
})

it("rejects malformed display modes, permission masks and command lists", () => {
	for (const patch of [{ display_mode: "bad" }, { perm: -1 }, { perm: NaN }, { do: "bad" }])
		expect(() =>
			serializeDevice({ ...deviceDraft({ uuid: "device-1", perm: 0 }), ...patch })
		).toThrow()
})

it("encodes passphrases/names and accepts bracketed or raw IPv6 without URL injection", () => {
	const link = new URL(pairingLink("fd00::1", "49989", "001234", "a&b?c", "PC name"))
	expect(link.hostname).toBe("[fd00::1]")
	expect(link.searchParams.get("passphrase")).toBe("a&b?c")
	expect(link.searchParams.get("pin")).toBe("001234")
	for (const host of ["https://host", "user@host", "host/path", "host?query"])
		expect(() => pairingLink(host, "49989", "123", "test", "PC")).toThrow()
	expect(() => pairingLink("host", "65536", "123", "test", "PC")).toThrow()
})
