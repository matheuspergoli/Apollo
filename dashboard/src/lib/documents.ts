import { queryOptions } from "@tanstack/react-query"
import { post, request } from "./api"

export type Document = Record<string, unknown>
export function object(value: unknown): Document {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("O host retornou dados em formato inesperado.")
	return value as Document
}
export function text(value: unknown, fallback = "") {
	return typeof value === "string" ? value : fallback
}
export function bool(value: unknown) {
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase()
		return (
			["true", "yes", "enable", "enabled", "on"].includes(normalized) ||
			normalized.includes("1")
		)
	}
	return value === true || value === 1
}
export function documents(value: unknown) {
	if (!Array.isArray(value)) throw new Error("O host não retornou a lista esperada.")
	return value.map(object)
}
export function accepted(value: unknown) {
	const response = object(value)
	if (response.status !== true)
		throw new Error(
			text(response.error) || text(response.message) || "O host não confirmou a operação."
		)
	return response
}
export async function action(path: string, data: unknown = {}) {
	return accepted(await post(path, data))
}
export const clientsOptions = queryOptions({
	queryKey: ["host", "clients"],
	queryFn: async ({ signal }) => {
		const response = accepted(await request("clients/list", { signal }))
		return { clients: documents(response.named_certs), platform: text(response.platform) }
	},
	staleTime: 5_000
})
export const applicationsOptions = queryOptions({
	queryKey: ["host", "applications"],
	queryFn: async ({ signal }) => {
		const response = object(await request("apps", { signal }))
		return {
			apps: documents(response.apps).filter((app) => typeof app.uuid === "string"),
			current: text(response.current_app),
			hostName: text(response.host_name),
			hostUuid: text(response.host_uuid)
		}
	},
	staleTime: 5_000
})
