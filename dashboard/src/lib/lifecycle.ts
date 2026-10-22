import { ApiError, post } from "./api"

export async function requestLifecycle(command: "restart" | "quit") {
	try {
		await post(command, {}, false)
		return "Solicitação enviada. Verifique o console e a disponibilidade do host antes de continuar."
	} catch (failure) {
		if (failure instanceof ApiError) throw failure
		return "A conexão foi encerrada ou não respondeu. Isso não confirma o reinício/encerramento. Verifique o console e a porta configurada; não repetiremos a ação automaticamente."
	}
}

export function configuredWebAddress(basePort: unknown, origin: string) {
	const port = Number(basePort)
	if (!Number.isInteger(port) || port < 1029 || port > 65514) return null
	const url = new URL(origin)
	url.port = String(port + 1)
	return url.origin
}
