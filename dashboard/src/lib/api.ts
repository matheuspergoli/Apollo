import { queryOptions } from "@tanstack/react-query"

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly reason?: string
	) {
		super(message)
	}
}

export async function request(
	path: string,
	options: RequestInit = {},
	json: boolean | "text" = true
): Promise<unknown> {
	try {
		// These writes refresh the native library and may retry virtual-display detection.
		// The isolated Windows run measured 11.4s without that driver; never retry writes.
		const libraryWrite =
			options.method === "POST" && ["apps", "apps/reorder", "apps/delete"].includes(path)
		const timeout = AbortSignal.timeout(libraryWrite ? 30_000 : 10_000)
		const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
		const response = await fetch(`/api/${path}`, {
			...options,
			signal,
			credentials: "same-origin",
			cache: "no-store"
		})
		if (!response.ok) {
			let reason: string | undefined
			if (response.status === 401) {
				const body = await response.json().catch(() => null)
				if (body && typeof body.reason === "string") reason = body.reason
			}
			throw new ApiError(
				response.status,
				response.status === 401
					? path === "login"
						? "Não foi possível entrar. Confira suas credenciais."
						: reason === "session_expired"
							? "A sessão expirou. Entre novamente."
							: "Acesso não autorizado. Entre novamente para continuar."
					: `O host recusou a solicitação (${response.status}).`,
				reason
			)
		}
		return json === "text" ? await response.text() : json ? await response.json() : undefined
	} catch (error) {
		if (error instanceof DOMException && error.name === "TimeoutError")
			throw new Error(
				options.method === "POST"
					? "O host não confirmou a operação dentro do prazo. Ela pode ter sido aplicada; verifique o estado no host antes de repetir."
					: "O host demorou para responder. Tente novamente."
			)
		if (error instanceof TypeError)
			throw new Error("Não foi possível conectar ao Apollo. Verifique se o host está aberto.")
		if (error instanceof SyntaxError)
			throw new Error(
				"Resposta inválida do host Apollo. Verifique o endereço e a disponibilidade do host."
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
