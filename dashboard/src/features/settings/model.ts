import { queryOptions } from "@tanstack/react-query"
import { request } from "@/lib/api"
import { accepted, type Document, object } from "@/lib/documents"
import extracted from "./schema.json"

export type SettingField = {
	key: string
	label: string
	description: string
	defaultValue: unknown
	options?: { value: string; label: string }[]
	min?: number
	max?: number
	step?: number
}
export type SettingSection = { id: string; title: string; fields: SettingField[] }
export const sections = extracted as SettingSection[]
export const fields = sections.flatMap((section) => section.fields)
const excludedKeys = new Set(["status", "platform", "version", "vdisplayStatus", "locale"])
export const complexKeys = new Set([
	"global_prep_cmd",
	"global_state_cmd",
	"server_cmd",
	"dd_mode_remapping"
])
export type Snapshot = { values: Document; platform: string; version: string }

export function snapshot(value: unknown): Snapshot {
	const response = accepted(value)
	return {
		values: Object.fromEntries(
			Object.entries(response).filter(([key]) => !excludedKeys.has(key))
		),
		platform: typeof response.platform === "string" ? response.platform : "",
		version: typeof response.version === "string" ? response.version : ""
	}
}
export async function loadSnapshot(signal?: AbortSignal) {
	return snapshot(await request("config", { signal }))
}
export const settingsOptions = queryOptions({
	queryKey: ["host", "settings"],
	queryFn: ({ signal }) => loadSnapshot(signal),
	staleTime: Infinity,
	refetchOnMount: false
})

export function draftFrom(current: Snapshot) {
	const result: Document = Object.assign(
		Object.create(null),
		Object.fromEntries(fields.map((field) => [field.key, structuredClone(field.defaultValue)]))
	)
	for (const [key, value] of Object.entries(current.values)) {
		if (complexKeys.has(key) && typeof value === "string") {
			try {
				result[key] = JSON.parse(value)
			} catch {
				result[key] = value
			}
		} else result[key] = value
	}
	return result
}
export function comparable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(comparable).join(",")}]`
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, child]) => `${JSON.stringify(key)}:${comparable(child)}`)
			.join(",")}}`
	return JSON.stringify(value) ?? "null"
}
export function changedKeys(original: Document, draft: Document) {
	return [...new Set([...Object.keys(original), ...Object.keys(draft)])].filter((key) => {
		const field = fields.find((candidate) => candidate.key === key)
		const normalize = (value: unknown) =>
			field &&
			typeof field.defaultValue === "number" &&
			value !== "" &&
			Number.isFinite(Number(value))
				? Number(value)
				: value
		return comparable(normalize(original[key])) !== comparable(normalize(draft[key]))
	})
}
export function fingerprint(current: Snapshot) {
	const draft = draftFrom(current)
	for (const field of fields)
		if (
			typeof field.defaultValue === "number" &&
			draft[field.key] !== "" &&
			Number.isFinite(Number(draft[field.key]))
		)
			draft[field.key] = Number(draft[field.key])
	return comparable(draft)
}
export function visibleSections(platform: string) {
	return sections.filter(
		(section) =>
			!(
				{
					windows: ["vt", "vaapi"],
					linux: ["amd", "qsv", "vt"],
					macos: ["amd", "nv", "qsv", "vaapi"]
				}[platform] ?? []
			).includes(section.id)
	)
}

export function serializeSettings(draft: Document): Document {
	const result = structuredClone(draft)
	for (const key of Object.keys(result)) {
		if (excludedKeys.has(key)) {
			delete result[key]
			continue
		}
		if (/[\r\n=]/.test(key)) throw new Error("Nome de configuração inválido.")
		if (typeof result[key] === "string" && /[\r\n]/.test(result[key] as string))
			throw new Error(`${key}: o valor deve ocupar uma única linha.`)
	}
	for (const field of fields) {
		const value = result[field.key]
		if (typeof field.defaultValue === "number" && value !== "" && value !== undefined) {
			const numeric = Number(value)
			if (
				!Number.isFinite(numeric) ||
				(field.min !== undefined && numeric < field.min) ||
				(field.max !== undefined && numeric > field.max)
			)
				throw new Error(`${field.label}: informe um número válido dentro dos limites.`)
			result[field.key] = numeric
		}
		if (complexKeys.has(field.key)) {
			if (field.key === "dd_mode_remapping") {
				const groups = object(value)
				for (const kind of ["mixed", "resolution_only", "refresh_rate_only"]) {
					if (!Array.isArray(groups[kind]))
						throw new Error("As regras de display devem ser listas válidas.")
					for (const row of groups[kind]) {
						for (const [column, cell] of Object.entries(object(row))) {
							if (typeof cell !== "string") continue
							if (cell && column.includes("resolution") && !/^\d+x\d+$/.test(cell))
								throw new Error(
									"Resolução inválida nas regras do display. Use largura x altura."
								)
							if (
								cell &&
								(column.includes("fps") || column.includes("refresh")) &&
								(!Number.isFinite(Number(cell)) || Number(cell) <= 0)
							)
								throw new Error("Frequência inválida nas regras do display.")
						}
					}
				}
			} else {
				if (!Array.isArray(value))
					throw new Error(`${field.label}: a lista de comandos é inválida.`)
				for (const row of value) object(row)
			}
		}
		const normalized = result[field.key]
		if (
			comparable(normalized) === comparable(field.defaultValue) ||
			normalized === "" ||
			normalized === undefined
		)
			delete result[field.key]
	}
	if (
		result.port !== undefined &&
		(!Number.isInteger(Number(result.port)) ||
			Number(result.port) < 1029 ||
			Number(result.port) > 65514)
	)
		throw new Error("A porta base deve ser um número inteiro entre 1029 e 65514.")
	if (result.fallback_mode && !/^\d+x\d+x\d+$/.test(String(result.fallback_mode)))
		throw new Error(
			"O modo fallback deve usar largura x altura x FPS, por exemplo 1920x1080x120."
		)
	return result
}
