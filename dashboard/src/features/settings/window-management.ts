import { queryOptions } from "@tanstack/react-query"
import { request } from "@/lib/api"
import { accepted, documents, object, text } from "@/lib/documents"

const phases = [
	"disabled",
	"waiting",
	"active",
	"paused",
	"stopping",
	"stopped",
	"failed"
] as const
type Phase = (typeof phases)[number]
const counters = [
	"generation",
	"moved",
	"restored",
	"skipped",
	"failed",
	"overflow",
	"last_error"
] as const
export const diagnosticLabels = {
	enumeration_failures: "Falhas de enumeração",
	inspection_failures: "Falhas de inspeção",
	submission_rejections: "Submissões recusadas",
	confirmation_timeouts: "Confirmações expiradas",
	confirmation_rejections: "Confirmações recusadas",
	restoration_skips: "Restaurações não submetidas",
	shutdown_unfinished: "Pendências no prazo de encerramento",
	target_failures: "Falhas de destino"
} as const
type DiagnosticCounter = keyof typeof diagnosticLabels
type WindowDiagnostics = Record<DiagnosticCounter, number> & {
	last_operation: string
	last_reason: string
	last_observation: string
}
export type WindowStatus = {
	supported: boolean
	manual_available: boolean
	phase: Phase
	reason: string
	recovery_required: boolean
	diagnostics: WindowDiagnostics
	applications: { uuid: string; name: string }[]
} & Record<(typeof counters)[number], number>

export function parseWindowStatus(value: unknown): WindowStatus {
	const source = accepted(value)
	if (
		typeof source.supported !== "boolean" ||
		typeof source.manual_available !== "boolean" ||
		!phases.includes(source.phase as Phase) ||
		typeof source.reason !== "string" ||
		typeof source.recovery_required !== "boolean" ||
		counters.some((key) => !Number.isSafeInteger(source[key]) || Number(source[key]) < 0)
	)
		throw new Error("O host retornou um estado de janelas inválido.")
	const diagnostics = object(source.diagnostics)
	if (
		Object.keys(diagnosticLabels).some(
			(key) => !Number.isSafeInteger(diagnostics[key]) || Number(diagnostics[key]) < 0
		) ||
		["last_operation", "last_reason", "last_observation"].some(
			(key) => typeof diagnostics[key] !== "string"
		)
	)
		throw new Error("O host retornou diagnósticos de janelas inválidos.")
	const applications = documents(source.applications).map((app) => {
		if (typeof app.uuid !== "string" || typeof app.name !== "string")
			throw new Error("A lista de aplicativos para a sessão é inválida.")
		return { uuid: app.uuid, name: app.name }
	})
	return {
		supported: source.supported,
		manual_available: source.supported && source.phase === "active" && source.manual_available,
		phase: source.phase as Phase,
		reason: text(source.reason),
		recovery_required: source.recovery_required,
		diagnostics: diagnostics as WindowDiagnostics,
		applications,
		...Object.fromEntries(counters.map((key) => [key, source[key]]))
	} as WindowStatus
}

export const windowStatusOptions = queryOptions({
	queryKey: ["host", "window-management"],
	queryFn: async ({ signal }) =>
		parseWindowStatus(await request("window-management", { signal })),
	refetchInterval: (query) => (query.state.status === "error" ? false : 3_000),
	refetchIntervalInBackground: false,
	retry: false
})

export const phaseLabels: Record<Phase, string> = {
	disabled: "Desativado",
	waiting: "Aguardando captura",
	active: "Ativo",
	paused: "Pausado",
	stopping: "Encerrando",
	stopped: "Encerrado",
	failed: "Indisponível"
}

const reasons: Record<string, string> = {
	not_configured: "Nenhuma sessão gerenciada foi preparada.",
	application_not_selected:
		"O aplicativo não está selecionado ou o gerenciamento está desativado.",
	waiting_for_capture:
		"Aguardando a origem de captura confirmada e uma sessão exclusiva com permissão de entrada.",
	active: "Gerenciando janelas elegíveis da sessão atual.",
	session_not_exclusive: "A sessão não tem exclusividade ou permissão de entrada.",
	desktop_unavailable:
		"O desktop interativo não está disponível. Nenhuma troca de desktop é realizada.",
	interactive_context_unavailable: "Aguardando acesso ao desktop do usuário interativo.",
	capture_unavailable: "A captura está sendo reinicializada ou não está disponível.",
	capture_target_mismatch: "A origem capturada não corresponde ao display virtual esperado.",
	target_unavailable:
		"O destino deixou de estar disponível. Não há fallback para monitor físico.",
	event_queue_overflow:
		"O limite de eventos foi excedido; o gerenciamento foi interrompido por segurança.",
	worker_stop_timeout:
		"O prazo de encerramento expirou. Outro worker não será iniciado até o anterior terminar.",
	worker_start_failed: "Não foi possível iniciar o gerenciamento de janelas.",
	hook_registration_failed: "Não foi possível registrar os eventos de janelas.",
	event_wait_failed: "Falha na espera pelos eventos de janelas.",
	worker_exception: "O gerenciamento foi interrompido por uma falha interna.",
	session_not_authorized: "A sessão não atende às condições de autorização.",
	restoring: "Conferindo movimentos e tentando restaurar posições dentro do prazo.",
	stopped: "O gerenciamento desta sessão terminou.",
	no_windows_owned: "A sessão terminou sem movimentos confirmados para restaurar.",
	unsupported_platform: "O gerenciamento de janelas está disponível somente no Windows."
}

export function windowStatusDescription(status: WindowStatus) {
	return (
		reasons[status.reason] ||
		"Estado não reconhecido. Atualize os dados e consulte o log do host."
	)
}

const operations: Record<string, string> = {
	none: "Nenhuma ocorrência",
	enumerate: "Descoberta de janelas",
	inspect: "Inspeção de janela",
	move: "Submissão de movimento",
	confirm_move: "Confirmação de movimento",
	confirm_restore: "Confirmação de restauração",
	restore: "Restauração",
	shutdown: "Encerramento",
	resolve_target: "Validação do destino",
	worker: "Executor de janelas"
}
const diagnosticReasons: Record<string, string> = {
	none: "Nenhum diagnóstico registrado.",
	enumeration_failed: "Não foi possível enumerar as janelas.",
	inspection_failed: "Não foi possível validar os dados de uma janela.",
	submission_rejected: "A solicitação não foi submetida como movimento pendente.",
	confirmation_timeout: "O resultado solicitado não foi confirmado dentro do prazo.",
	ownership_lost: "Não há evidência válida de propriedade para esta operação.",
	identity_changed: "A identidade da janela deixou de corresponder à solicitação.",
	window_ineligible: "A janela deixou de atender às condições de gerenciamento.",
	ownership_not_recorded:
		"O movimento observado não pôde adquirir propriedade para restauração.",
	target_unavailable:
		"O destino não pôde ser revalidado. Nenhum monitor alternativo é escolhido.",
	target_area_unavailable: "A área útil ou o DPI do destino não pôde ser validado.",
	origin_unavailable: "A origem da restauração não pôde ser revalidada.",
	shutdown_deadline:
		"O prazo terminou com operações ainda incompletas. Elas não contam como sucesso."
}
const observations: Record<string, string> = {
	not_observed: "Nenhuma conferência válida antes de expirar.",
	state_mismatch: "Última conferência: estado normal/maximizado diferente do solicitado.",
	position_mismatch: "Última conferência: posição ou tamanho diferente do solicitado.",
	destination_mismatch: "Última conferência: monitor diferente do destino solicitado."
}

export function windowDiagnosticDescription(status: WindowStatus) {
	const { last_operation, last_reason, last_observation } = status.diagnostics
	const operation = operations[last_operation] || "Operação não reconhecida"
	const reason =
		diagnosticReasons[last_reason] || reasons[last_reason] || "Motivo não reconhecido."
	const observation = observations[last_observation] || ""
	const code = status.last_error
		? ` Código Win32 ${status.last_error}.`
		: " Sem código Win32 associado."
	return `${operation}: ${reason}${observation ? ` ${observation}` : ""}${code}`
}
