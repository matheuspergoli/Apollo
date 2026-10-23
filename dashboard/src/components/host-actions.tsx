import { IconRefresh, IconX } from "@tabler/icons-react"
import { useIsMutating } from "@tanstack/react-query"
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useState
} from "react"
import { requestLifecycle } from "@/lib/lifecycle"
import { ConfirmedAction } from "./confirmed-action"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"

const Context = createContext<{
	busy: boolean
	track: (id: string, active: boolean) => void
	feedback: string
	setFeedback: (value: string) => void
} | null>(null)

export function HostActionsProvider({ children }: { children: ReactNode }) {
	const mutations = useIsMutating()
	const [active, setActive] = useState<Set<string>>(() => new Set())
	const [feedback, setFeedback] = useState("")
	const track = useCallback(
		(id: string, enabled: boolean) =>
			setActive((previous) => {
				if (previous.has(id) === enabled) return previous
				const next = new Set(previous)
				if (enabled) next.add(id)
				else next.delete(id)
				return next
			}),
		[]
	)
	const value = useMemo(
		() => ({ busy: active.size > 0 || mutations > 0, track, feedback, setFeedback }),
		[active, mutations, track, feedback]
	)
	return <Context value={value}>{children}</Context>
}

export function useTrackHostEdits(dirty: boolean, pending: boolean) {
	const context = useContext(Context)
	const track = context?.track
	const id = useId()
	useEffect(() => {
		track?.(id, dirty || pending)
		return () => track?.(id, false)
	}, [id, dirty, pending, track])
}

export function QuickHostRestart() {
	const context = useContext(Context)
	if (!context) throw new Error("Ações do host sem provider")
	return (
		<ConfirmedAction
			label="Reiniciar host"
			destructive
			triggerVariant="outline"
			compact
			icon={<IconRefresh />}
			disabled={context.busy}
			triggerTitle={
				context.busy
					? "Salve ou descarte as alterações e aguarde operações pendentes antes de reiniciar"
					: "Reiniciar host"
			}
			description="Interrompe aplicativos e streams. Não salva rascunhos. O painel pode perder a conexão e pode ser necessário entrar novamente; confira o console e a porta configurada antes de repetir."
			execute={async () => {
				context.setFeedback("")
				context.setFeedback(await requestLifecycle("restart"))
			}}
		/>
	)
}

export function HostActionNotice() {
	const context = useContext(Context)
	if (!context?.feedback) return null
	return (
		<Alert role="status">
			<AlertTitle>Verifique o estado do host</AlertTitle>
			<AlertDescription>
				{context.feedback}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => context.setFeedback("")}
				>
					<IconX />
					Dispensar aviso
				</Button>
			</AlertDescription>
		</Alert>
	)
}
