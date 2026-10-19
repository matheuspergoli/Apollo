import { queryOptions } from "@tanstack/react-query"

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message)
	}
}

export async function request(
	path: string,
	options: RequestInit = {},
	json = true
): Promise<unknown> {
	try {
		const timeout = AbortSignal.timeout(10_000)
		const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
		const response = await fetch(`/api/${path}`, {
			...options,
			signal,
			credentials: "same-origin",
			cache: "no-store"
		})
		if (!response.ok)
			throw new ApiError(
				response.status,
				response.status === 401
					? "Sessão expirada ou credenciais incorretas."
					: `O host recusou a solicitação (${response.status}).`
			)
		return json ? await response.json() : undefined
	} catch (error) {
		if (error instanceof DOMException && error.name === "TimeoutError")
			throw new Error("O host demorou para responder. Tente novamente.")
		if (error instanceof TypeError)
			throw new Error("Não foi possível conectar ao Apollo. Verifique se o host está aberto.")
		if (error instanceof SyntaxError)
			throw new Error(
				"Resposta inválida. Esta interface precisa ser servida pelo host Apollo ou por uma API de teste."
			)
		throw error
	}
}

export const post = (path: string, data: unknown, json = true) =>
	request(
		path,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data)
		},
		json
	)

export type HostConfig = {
	version?: string
	sunshine_name?: string
	capture?: string
	output_name?: string
	adapter_name?: string
	nvenc_preset?: string
	fallback_mode?: string
	vdisplayStatus?: number
}

export function parseConfig(value: unknown): HostConfig {
	if (!value || typeof value !== "object" || !("status" in value) || value.status !== true)
		throw new Error("Configuração indisponível.")
	const record = value as Record<string, unknown>
	const result: Record<string, string | number> = {}
	for (const key of [
		"version",
		"sunshine_name",
		"capture",
		"output_name",
		"adapter_name",
		"nvenc_preset",
		"fallback_mode"
	]) {
		if (typeof record[key] === "string") result[key] = record[key]
	}
	if (typeof record.vdisplayStatus === "number") result.vdisplayStatus = record.vdisplayStatus
	return result
}

export const configOptions = queryOptions({
	queryKey: ["host", "config-file"],
	queryFn: async ({ signal }) => parseConfig(await request("config", { signal })),
	staleTime: 15_000
})
