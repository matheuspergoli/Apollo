import { IconCopy, IconRefresh } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"
import { ConfirmedAction } from "@/components/confirmed-action"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"
import { configOptions, request } from "@/lib/api"
import { action } from "@/lib/documents"
import { downloadFile } from "@/lib/download"
import { requestLifecycle } from "@/lib/lifecycle"

export function DiagnosticsPage() {
	const logs = useQuery({
		queryKey: ["host", "logs"],
		queryFn: async ({ signal }) => {
			const data = await request("logs", { signal }, "text")
			if (typeof data !== "string") throw new Error("Log inválido")
			return data
		},
		staleTime: Infinity,
		gcTime: 0,
		refetchOnMount: "always"
	})
	const config = useQuery(configOptions)
	const [search, setSearch] = useState("")
	const [level, setLevel] = useState("all")
	const [feedback, setFeedback] = useState("")
	const [error, setError] = useState<Error | null>(null)
	const deferred = useDeferredValue(search)
	const all = (logs.data || "").split(/\r?\n/)
	const filtered = all.filter(
		(line) =>
			(!deferred || line.toLowerCase().includes(deferred.toLowerCase())) &&
			(level === "all" || (level === "error" ? /error|fatal/i.test(line) : /warn/i.test(line)))
	)
	const visible = filtered.slice(-1000).join("\n")
	async function lifecycle(command: "restart" | "quit") {
		setFeedback("")
		setFeedback(await requestLifecycle(command))
	}
	const levels = [
		{ value: "all", label: "Todos os níveis" },
		{ value: "error", label: "Erros e fatais" },
		{ value: "warning", label: "Avisos" }
	]
	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-widest">
						Observação e recuperação
					</p>
					<h1 className="mt-2 font-semibold text-3xl tracking-tight">Diagnóstico</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Consulte os logs e acesse ações de recuperação do host.
					</p>
				</div>
				<Button
					variant="outline"
					disabled={logs.isFetching}
					onClick={() => void logs.refetch()}
				>
					<IconRefresh />
					{logs.isFetching ? "Lendo…" : "Atualizar log"}
				</Button>
			</div>
			<RequestError error={logs.error || error} />
			{feedback && (
				<Alert role="status">
					<AlertTitle>Verifique o estado do host</AlertTitle>
					<AlertDescription>{feedback}</AlertDescription>
				</Alert>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Log do Apollo</CardTitle>
					<CardDescription>
						Mostrando até 1.000 linhas filtradas de {all.length} linhas carregadas. Use
						Atualizar log para uma nova leitura.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-3">
						<Input
							aria-label="Buscar no log"
							placeholder="Buscar texto no log…"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="max-w-lg"
						/>
						<Select
							items={levels}
							value={level}
							onValueChange={(value) => {
								if (typeof value === "string") setLevel(value)
							}}
						>
							<SelectTrigger aria-label="Filtrar nível">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{levels.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							variant="outline"
							disabled={!visible}
							onClick={() => {
								navigator.clipboard
									.writeText(visible)
									.then(() =>
										setFeedback(
											"Trecho visível copiado. Revise dados pessoais antes de compartilhar."
										)
									)
									.catch(() => setError(new Error("Não foi possível copiar o trecho.")))
							}}
						>
							<IconCopy />
							Copiar trecho
						</Button>
						<ConfirmedAction
							label="Baixar log completo"
							disabled={!logs.data}
							description="O log pode conter nomes, caminhos, endereços e comandos privados. Revise antes de compartilhar. O download permanece no seu dispositivo."
							execute={async () => {
								downloadFile("apollo-log.txt", logs.data || "")
								setFeedback("Download solicitado. Revise o arquivo antes de compartilhar.")
							}}
						/>
					</div>
					<ScrollArea
						role="region"
						aria-label="Conteúdo do log"
						className="h-[60dvh] border bg-muted/30"
					>
						<pre className="min-h-64 p-4 font-mono text-xs leading-6">
							{logs.isPending
								? "Lendo arquivo…"
								: visible || "Nenhuma linha corresponde ao filtro."}
						</pre>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				</CardContent>
			</Card>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Recuperação da sessão</CardTitle>
						<CardDescription>
							Ações com efeito imediato no host. Salve o progresso do jogo e mantenha acesso
							local ao computador.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-3">
						<ConfirmedAction
							label="Encerrar aplicativo"
							destructive
							description="Encerra o aplicativo em execução e pode interromper todos os streams. Não salva o progresso do jogo."
							execute={() => action("apps/close")}
						/>
						<ConfirmedAction
							label="Restaurar persistência de display"
							destructive
							description="Solicita a restauração das configurações de display persistidas pelo Apollo. Pode alterar a topologia e interromper o stream. Não instala nem troca o driver."
							execute={() => action("reset-display-device-persistence")}
						/>
						<ConfirmedAction
							label="Reiniciar Apollo"
							destructive
							description="Interrompe sessões e reinicia o processo quando suportado. Em execução manual, pode ser necessário iniciar novamente pelo launcher. A conexão pode cair sem resposta."
							execute={() => lifecycle("restart")}
						/>
						<ConfirmedAction
							label="Encerrar Apollo"
							destructive
							description="Encerra este host e seus aplicativos. O painel ficará indisponível. Você deverá restaurar o serviço ou executar o launcher manualmente."
							execute={() => lifecycle("quit")}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Informações do host</CardTitle>
						<CardDescription>
							Versão, driver virtual e opções salvas do Apollo.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 text-sm">
						<RequestError error={config.error} />
						<p>
							Versão:{" "}
							<span className="font-mono">{config.data?.version || "Não informada"}</span>
						</p>
						<p>
							Driver virtual:{" "}
							{config.data?.vdisplayStatus === 0
								? "Inicializado"
								: config.data?.vdisplayStatus === undefined
									? "Não informado"
									: `Código ${config.data.vdisplayStatus}`}
						</p>
						<p>Captura configurada: {config.data?.capture || "Automática"}</p>
						<p className="text-muted-foreground">
							Confira codec, FPS, rede e decodificação nas estatísticas do Artemis. A latência
							de ponta a ponta não é medida por este painel.
						</p>
						<p role="status" className="text-muted-foreground text-xs">
							{config.isFetching
								? "Atualizando informações do host…"
								: config.isError
									? "Não foi possível atualizar. Os dados anteriores podem estar desatualizados."
									: config.dataUpdatedAt
										? `Informações atualizadas às ${new Date(config.dataUpdatedAt).toLocaleTimeString("pt-BR")}.`
										: "Aguardando leitura do host."}
						</p>
						<Button
							variant="outline"
							disabled={config.isFetching}
							onClick={() => void config.refetch()}
						>
							<IconRefresh />
							{config.isFetching ? "Atualizando…" : "Atualizar informações do host"}
						</Button>
					</CardContent>
				</Card>
			</div>
		</>
	)
}
