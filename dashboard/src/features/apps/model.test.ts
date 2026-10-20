import { expect, it } from "vitest"
import { appDraft, launcherFile, launchLink, validateApp } from "./model"

it("preserves application UUID, custom fields, identity, hooks and execution flags", () => {
	const original = {
		uuid: "app-1",
		name: "Game",
		custom: "keep",
		"state-cmd": [{ do: "start", undo: "stop", elevated: false }],
		"per-client-app-identity": true
	}
	const draft = appDraft(original)
	draft.name = "Edited"
	const payload = validateApp(draft)
	expect(payload.uuid).toBe("app-1")
	expect(payload.custom).toBe("keep")
	expect(payload["state-cmd"]).toEqual(original["state-cmd"])
	expect(payload["per-client-app-identity"]).toBe(true)
	expect(original.name).toBe("Game")
})

it("retains every original editable app key, including the working directory", () => {
	const app = appDraft()
	for (const key of [
		"name",
		"output",
		"cmd",
		"working-dir",
		"exclude-global-prep-cmd",
		"exclude-global-state-cmd",
		"elevated",
		"auto-detach",
		"wait-all",
		"exit-timeout",
		"prep-cmd",
		"state-cmd",
		"detached",
		"image-path",
		"scale-factor",
		"use-app-identity",
		"per-client-app-identity",
		"allow-client-commands",
		"virtual-display",
		"terminate-on-pause",
		"gamepad"
	])
		expect(app).toHaveProperty(key)
})

it("validates names, hook lists and timeout/scale limits", () => {
	for (const patch of [
		{ name: "" },
		{ name: "bad\nname" },
		{ "prep-cmd": "broken" },
		{ "exit-timeout": -1 },
		{ "scale-factor": 201 }
	])
		expect(() => validateApp({ ...appDraft({ name: "Test" }), ...patch })).toThrow()
})

it("exports the native Artemis file format and correctly encoded launch link", () => {
	const app = { uuid: "app-1", name: "Game & More" }
	expect(launcherFile(app, "host-1", "PC\nInjected")).toContain("[host_name] PC Injected")
	const link = new URL(launchLink(app, "host-1", "PC"))
	expect(link.searchParams.get("app_name")).toBe("Game & More")
	expect(link.searchParams.get("host_uuid")).toBe("host-1")
})
