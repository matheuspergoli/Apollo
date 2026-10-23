import { expect, it } from "vitest"
import { normalizeSearch } from "@/lib/search"
import { visibleSections } from "./model"
import { searchSettings } from "./search"

it("normalizes composed/decomposed accents, case, punctuation and repeated spaces", () => {
	expect(normalizeSearch("  SAÍDA__de-Áudio  ")).toBe("saida de audio")
	expect(normalizeSearch("sai\u0301da")).toBe("saida")
})

it("finds the same settings with or without accents and ranks exact keys first", () => {
	const groups = visibleSections("windows")
	expect(searchSettings(groups, "saida").map((result) => result.field.key)).toEqual(
		searchSettings(groups, "saída").map((result) => result.field.key)
	)
	expect(searchSettings(groups, "saida de audio")[0]?.field.key).toBe("audio_sink")
	expect(searchSettings(groups, "nvenc_preset")[0]?.field.key).toBe("nvenc_preset")
})

it("matches all words independently of their order and searches group/option labels", () => {
	const groups = visibleSections("windows")
	expect(
		searchSettings(groups, "audio saida").some((result) => result.field.key === "audio_sink")
	).toBe(true)
	expect(searchSettings(groups, "seguranca porta")[0]?.field.key).toBe("port")
	expect(
		searchSettings(groups, "p7").some((result) => result.field.key === "nvenc_preset")
	).toBe(true)
	expect(searchSettings(groups, "audio inexistente123")).toEqual([])
})

it("handles empty, punctuation-only and excessive input without showing hidden platform fields", () => {
	const groups = visibleSections("windows")
	for (const query of ["", "  ", ".*[]", "x".repeat(257)])
		expect(searchSettings(groups, query)).toEqual([])
	expect(
		searchSettings(groups, "videotoolbox", "windows").some(
			(result) => result.group.id === "vt"
		)
	).toBe(false)
})
