import { IconRefresh, IconX } from "@tabler/icons-react"
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState
} from "react"
import { ApiError, configOptions, parseConfig, request } from "@/lib/api"
import { requestLifecycle } from "@/lib/lifecycle"
import { ConfirmedAction } from "./confirmed-action"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button, buttonVariants } from "./ui/button"

const Context = createContext<{
	busy: boolean
	track: (id: string, active: boolean) => void
	feedback: string
	setFeedback: (value: string) => void
	sessionExpired: boolean
	checking: boolean
	verificationError: string
	verifySession: () => Promise<void>
	expireSession: () => void
} | null>(null)

export function HostActionsProvider({ children }: { children: ReactNode }) {
	const mutations = useIsMutating()
	const client = useQueryClient()
	const session = useQuery(configOptions)
	const [sessionExpired, setSessionExpired] = useState(false)
	const [checking, setChecking] = useState(false)
	const [verificationError, setVerificationError] = useState("")
	const [feedback, setFeedback] = useState("")
	const checkInFlight = useRef<Promise<void> | null>(null)
	const expireSession = useCallback(() => setSessionExpired(true), [])
	const verifySession = useCallback(() => {
		if (checkInFlight.current) return checkInFlight.current
		setChecking(true)
		setVerificationError("")
		const pending = (async () => {
			try {
				const config = parseConfig(await request("config"))
				client.setQueryData(configOptions.queryKey, config)
				setSessionExpired(false)
				setFeedback("")
				void client.invalidateQueries({
					queryKey: ["host"],
					predicate: (query) =>
						query.state.error instanceof ApiError && query.state.error.status === 401
				})
			} catch (failure) {
				setVerificationError(
					failure instanceof ApiError && failure.status === 401
						? "A sessão ainda não foi renovada. Conclua o login."
						: "Não foi possível verificar a sessão. Confira se o host está disponível."
				)
			} finally {
				setChecking(false)
				checkInFlight.current = null
			}
		})()
		checkInFlight.current = pending
		return pending
	}, [client])
	useEffect(() => {
		if (session.error instanceof ApiError && session.error.status === 401)
			setSessionExpired(true)
	}, [session.error])
	useEffect(() => {
		const queries = client.getQueryCache().subscribe((event) => {
			if (
				event.type === "updated" &&
				event.action.type === "error" &&
				event.query.state.error instanceof ApiError &&
				event.query.state.error.status === 401
			)
				setSessionExpired(true)
		})
		const mutations = client.getMutationCache().subscribe((event) => {
			if (
				event.type === "updated" &&
				event.action.type === "error" &&
				event.mutation.state.error instanceof ApiError &&
				event.mutation.state.error.status === 401
			)
				setSessionExpired(true)
		})
		return () => {
			queries()
			mutations()
		}
	}, [client])
	useEffect(() => {
		if (!sessionExpired) return
		const verify = () => {
			if (document.visibilityState === "visible") void verifySession()
		}
		window.addEventListener("focus", verify)
		document.addEventListener("visibilitychange", verify)
		return () => {
			window.removeEventListener("focus", verify)
			document.removeEventListener("visibilitychange", verify)
		}
	}, [sessionExpired, verifySession])
	const [active, setActive] = useState<Set<string>>(() => new Set())
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
		() => ({
			busy: active.size > 0 || mutations > 0,
			track,
			feedback,
			setFeedback,
			sessionExpired,
			checking,
			verificationError,
			verifySession,
			expireSession
		}),
		[
			active,
			mutations,
			track,
			feedback,
			sessionExpired,
			checking,
			verificationError,
			verifySession,
			expireSession
		]
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
			icon={<IconRefresh />}
			disabled={context.busy || context.sessionExpired}
			triggerTitle={
				context.sessionExpired
					? "Entre novamente antes de reiniciar o host"
					: context.busy
						? "Salve ou descarte as alterações e aguarde operações pendentes antes de reiniciar"
						: "Reiniciar host"
			}
			description="Interrompe aplicativos e streams. Não salva rascunhos. O painel pode perder a conexão e pode ser necessário entrar novamente; confira o console e a porta configurada antes de repetir."
			execute={async () => {
				context.setFeedback("")
				try {
					context.setFeedback(await requestLifecycle("restart"))
				} catch (failure) {
					if (failure instanceof ApiError && failure.status === 401) context.expireSession()
					else throw failure
				}
			}}
		/>
	)
}

export function HostActionNotice() {
	const context = useContext(Context)
	if (context?.sessionExpired)
		return (
			<Alert variant="destructive" role="status">
				<AlertTitle>Sessão expirada</AlertTitle>
				<AlertDescription>
					Entre novamente para autorizar ações no host. Rascunhos desta aba serão preservados;
					abrir o login não envia comandos de reinício.
					<div className="mt-2 flex flex-wrap gap-2">
						<Link
							to="/login"
							target="_blank"
							rel="noopener noreferrer"
							className={buttonVariants({ variant: "outline" })}
						>
							Entrar novamente
						</Link>
						<Button
							type="button"
							variant="outline"
							disabled={context.checking}
							onClick={() => void context.verifySession()}
						>
							{context.checking ? "Verificando…" : "Verificar sessão"}
						</Button>
					</div>
					{context.verificationError && <p>{context.verificationError}</p>}
				</AlertDescription>
			</Alert>
		)
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
