import {
	IconArrowDown,
	IconArrowUp,
	IconDeviceFloppy,
	IconEdit,
	IconPlus,
	IconRefresh
} from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { CommandList } from "@/components/command-list"
import { ConfirmedAction } from "@/components/confirmed-action"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UnsavedChanges } from "@/components/unsaved-changes"
import { ArtemisLaunch } from "@/features/apps/artemis-launch"
import { ApplicationConfigurationControls } from "@/features/apps/configuration-controls"
import { CoverPicker } from "@/features/apps/covers"
import { appDraft, launcherFile, validateApp } from "@/features/apps/model"
import { comparable } from "@/features/settings/model"
import { ApiError } from "@/lib/api"
import { action, applicationsOptions, bool, type Document, text } from "@/lib/documents"
import { downloadFile } from "@/lib/download"

const appText = [
	["name", "Nome", "Nome exibido na biblioteca do Artemis."],
	[
		"cmd",
		"Comando de inicialização",
		"Um comando vazio abre somente o desktop. Os comandos são executados no host."
	],
	["working-dir", "Diretório de trabalho", "Pasta usada como diretório atual do aplicativo."],
	["output", "Arquivo de saída", "Caminho no host para registrar a saída do processo."],
	["image-path", "Caminho da capa", "Caminho completo de uma imagem PNG no host, sem aspas."]
] as const
const toggles = [
	["elevated", "Executar com privilégios elevados"],
	["auto-detach", "Detectar e desanexar processos em segundo plano"],
	["wait-all", "Aguardar todos os processos"],
	["terminate-on-pause", "Encerrar ao pausar"],
	["virtual-display", "Usar display virtual"],
	["use-app-identity", "Identidade de display por aplicativo"],
	["per-client-app-identity", "Identidade por cliente e aplicativo"],
	["allow-client-commands", "Permitir comandos do cliente"],
	["exclude-global-prep-cmd", "Ignorar comandos globais de preparação"],
	["exclude-global-state-cmd", "Ignorar comandos globais de estado"]
] as const

function AppEditor({
	original,
	onClose,
	onSaved,
	hostUuid,
	hostName,
	hasPendingOrder = false
}: {
	original: Document
	onClose: () => void
	onSaved: () => Promise<unknown>
	hostUuid: string
	hostName: string
	hasPendingOrder?: boolean
}) {
	const [draft, setDraft] = useState(() => appDraft(original))
	const mutation = useMutation({
		mutationFn: () => action("apps", validateApp(draft)),
		onSuccess: async () => {
			await onSaved()
			onClose()
		}
	})
	const changed = comparable(draft) !== comparable(appDraft(original))
	const set = (key: string, value: unknown) =>
		setDraft((previous) => ({ ...previous, [key]: value }))
	const gamepads = [
		{ value: "__global__", label: "Configuração global" },
		{ value: "disabled", label: "Desativado" },
		{ value: "auto", label: "Automático" },
		{ value: "x360", label: "Xbox 360" },
		{ value: "ds4", label: "DualShock 4" },
		{ value: "ds5", label: "DualSense (Linux)" },
		{ value: "switch", label: "Switch (Linux)" },
		{ value: "xone", label: "Xbox One (Linux)" }
	]
	return (
		<>
			<UnsavedChanges dirty={changed || hasPendingOrder} pending={mutation.isPending} />
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-widest">
						Biblioteca / editor
					</p>
					<h1 className="mt-2 font-semibold text-3xl tracking-tight">
						{text(original.uuid) ? text(draft.name) || "Editar aplicativo" : "Novo aplicativo"}
					</h1>
				</div>
				{changed ? (
					<ConfirmedAction
						label="Cancelar edição"
						description="Descarta as alterações deste aplicativo que ainda não foram salvas. O arquivo no host permanece intacto."
						disabled={mutation.isPending}
						execute={async () => onClose()}
					/>
				) : (
					<Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
						Cancelar edição
					</Button>
				)}
			</div>
			<RequestError error={mutation.error} />
			<ApplicationConfigurationControls
				current={draft}
				disabled={mutation.isPending}
				onApply={(values) => {
					setDraft((previous) => ({ ...previous, ...values }))
					mutation.reset()
				}}
			/>
			<form
				className="min-w-0 space-y-6"
				onSubmit={(event) => {
					event.preventDefault()
					if (!mutation.isPending) mutation.mutate()
				}}
			>
				<Card>
					<CardHeader>
						<CardTitle>Inicialização</CardTitle>
						<CardDescription>
							O arquivo é alterado somente ao salvar. Nenhum aplicativo é iniciado
							automaticamente.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							{appText.map(([key, label, help]) => (
								<Field key={key}>
									<FieldLabel htmlFor={`app-${key}`}>{label}</FieldLabel>
									<Input
										id={`app-${key}`}
										value={text(draft[key])}
										onChange={(event) => set(key, event.target.value)}
										required={key === "name"}
										className={key === "name" ? "" : "font-mono"}
									/>
									<FieldDescription>{help}</FieldDescription>
									{key === "image-path" && (
										<CoverPicker
											name={text(draft.name)}
											path={text(draft[key])}
											onChange={(path) => set(key, path)}
										/>
									)}
								</Field>
							))}
							<Field>
								<FieldLabel htmlFor="app-gamepad">Controle por aplicativo</FieldLabel>
								<Select
									items={gamepads}
									value={text(draft.gamepad) || "__global__"}
									onValueChange={(value) =>
										set("gamepad", value === "__global__" ? "" : value)
									}
								>
									<SelectTrigger id="app-gamepad">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{gamepads.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							<div className="grid gap-5 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="app-exit">Espera para encerrar (segundos)</FieldLabel>
									<Input
										id="app-exit"
										type="number"
										min={0}
										value={String(draft["exit-timeout"])}
										onChange={(event) => set("exit-timeout", event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="app-scale">Escala de resolução (%)</FieldLabel>
									<Input
										id="app-scale"
										type="number"
										min={20}
										max={200}
										value={String(draft["scale-factor"])}
										onChange={(event) => set("scale-factor", event.target.value)}
									/>
								</Field>
							</div>
							{toggles.map(([key, label]) => (
								<Field key={key} orientation="horizontal">
									<FieldLabel htmlFor={`app-${key}`}>{label}</FieldLabel>
									<Switch
										id={`app-${key}`}
										checked={bool(draft[key])}
										onCheckedChange={(checked) => set(key, checked)}
									/>
								</Field>
							))}
						</FieldGroup>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Automação e processos</CardTitle>
						<CardDescription>
							Preparação/desfazer, eventos de sessão e processos independentes. Revise
							privilégios antes de salvar.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-8">
						{["prep-cmd", "state-cmd"].map((key) => (
							<section key={key} className="space-y-3">
								<h2 className="font-medium">
									{key === "prep-cmd"
										? "Preparação e desfazer"
										: "Conectar e desconectar sessão"}
								</h2>
								<CommandList
									id={key}
									value={draft[key]}
									onChange={(value) => set(key, value)}
								/>
							</section>
						))}
						<Field>
							<FieldLabel htmlFor="app-detached">Comandos desanexados</FieldLabel>
							<Textarea
								id="app-detached"
								value={Array.isArray(draft.detached) ? draft.detached.join("\n") : ""}
								onChange={(event) => set("detached", event.target.value.split("\n"))}
								className="min-h-28 font-mono"
							/>
							<FieldDescription>
								Um comando por linha, na ordem de execução. Não são aguardados pelo host.
							</FieldDescription>
						</Field>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Variáveis disponíveis</CardTitle>
						<CardDescription>
							Use estas referências nos seus comandos. Não alteram o ambiente até os eventos
							correspondentes ocorrerem.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2 font-mono text-xs sm:grid-cols-2">
						{[
							"APOLLO_APP_ID",
							"APOLLO_APP_NAME",
							"APOLLO_APP_UUID",
							"APOLLO_APP_STATUS",
							"APOLLO_CLIENT_UUID",
							"APOLLO_CLIENT_NAME",
							"APOLLO_CLIENT_WIDTH",
							"APOLLO_CLIENT_HEIGHT",
							"APOLLO_CLIENT_FPS",
							"APOLLO_CLIENT_HDR",
							"APOLLO_CLIENT_GCMAP",
							"APOLLO_CLIENT_HOST_AUDIO",
							"APOLLO_CLIENT_ENABLE_SOPS",
							"APOLLO_CLIENT_AUDIO_CONFIGURATION"
						].map((name) => (
							<span key={name} className="border bg-muted/30 p-2">
								{name}
							</span>
						))}
					</CardContent>
				</Card>
				<Card
					data-slot="editor-actions"
					className="sticky bottom-0 z-20 w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 bg-card/95 px-(--card-spacing) shadow-sm backdrop-blur-sm"
				>
					{text(draft.uuid) && (
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								downloadFile(
									`${text(draft.name)}.art`,
									launcherFile(draft, hostUuid, hostName)
								)
							}
						>
							Exportar atalho Artemis
						</Button>
					)}
					<Button type="submit" disabled={mutation.isPending || !text(draft.name).trim()}>
						<IconDeviceFloppy />
						{mutation.isPending ? "Salvando…" : "Salvar aplicativo"}
					</Button>
				</Card>
			</form>
		</>
	)
}

export function ApplicationsPage() {
	const [editor, setEditor] = useState<Document | null>(null)
	const query = useQuery({
		...applicationsOptions,
		refetchInterval: editor ? false : applicationsOptions.refetchInterval,
		refetchOnWindowFocus: editor ? false : "always"
	})
	const client = useQueryClient()
	const [filter, setFilter] = useState("")
	const [order, setOrder] = useState<string[] | null>(null)
	const refresh = () => client.invalidateQueries({ queryKey: applicationsOptions.queryKey })
	const saveOrder = useMutation({
		mutationFn: () => action("apps/reorder", { order }),
		onSuccess: async () => {
			setOrder(null)
			await refresh()
		}
	})
	if (query.isPending) return <Skeleton className="h-96 w-full" />
	if (
		query.error &&
		(!query.data ||
			(query.error instanceof ApiError && [401, 403].includes(query.error.status)))
	)
		return <RequestError error={query.error} retry={() => void query.refetch()} />
	const data = query.data
	if (!data) return null
	if (editor)
		return (
			<AppEditor
				key={text(editor.uuid, "new")}
				original={editor}
				onClose={() => setEditor(null)}
				onSaved={refresh}
				hostUuid={data.hostUuid}
				hostName={data.hostName}
				hasPendingOrder={Boolean(order)}
			/>
		)
	const ordered = order
		? order
				.map((uuid) => data.apps.find((app) => app.uuid === uuid))
				.filter((app): app is Document => Boolean(app))
		: data.apps
	const filtered = ordered.filter((app) =>
		text(app.name).toLocaleLowerCase().includes(filter.toLocaleLowerCase())
	)
	function move(uuid: string, direction: number) {
		const next = ordered.map((app) => text(app.uuid))
		const index = next.indexOf(uuid)
		const destination = index + direction
		if (destination < 0 || destination >= next.length) return
		;[next[index], next[destination]] = [next[destination], next[index]]
		setOrder(next)
	}
	return (
		<>
			<UnsavedChanges dirty={Boolean(order)} />
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-widest">
						Biblioteca do host
					</p>
					<h1 className="mt-2 font-semibold text-3xl tracking-tight">Aplicativos</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{data.apps.length} entradas · lançar, organizar e configurar sem sair do painel.
					</p>
				</div>
				<Button onClick={() => setEditor({})}>
					<IconPlus />
					Novo aplicativo
				</Button>
			</div>
			<RequestError
				error={query.error || saveOrder.error}
				retry={query.error ? () => void query.refetch() : undefined}
			/>
			<p className="text-muted-foreground text-xs">
				Leitura às {new Date(query.dataUpdatedAt).toLocaleTimeString("pt-BR")}.{" "}
				{query.isError
					? "Estado não confirmado. Atualize a leitura para tentar novamente."
					: "Atualização a cada 3 segundos com esta página visível."}
			</p>
			<div className="flex flex-wrap gap-3">
				<Button
					variant="outline"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					<IconRefresh />
					Atualizar aplicativos
				</Button>
				<Input
					aria-label="Buscar aplicativos"
					placeholder="Buscar aplicativos…"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					className="max-w-md"
				/>
				<Button
					variant="outline"
					onClick={() =>
						setOrder(
							[...ordered]
								.sort((a, b) => text(a.name).localeCompare(text(b.name)))
								.map((app) => text(app.uuid))
						)
					}
				>
					Ordenar A–Z
				</Button>
				{order && (
					<>
						<Button disabled={saveOrder.isPending} onClick={() => saveOrder.mutate()}>
							Salvar ordem
						</Button>
						<Button variant="outline" onClick={() => setOrder(null)}>
							Descartar ordem
						</Button>
					</>
				)}
			</div>
			{!filtered.length && (
				<Alert role="status">
					<AlertTitle>Nenhum aplicativo encontrado</AlertTitle>
					<AlertDescription>
						Crie uma entrada ou ajuste sua busca. O desktop pode usar um comando vazio.
					</AlertDescription>
				</Alert>
			)}
			<div className="grid gap-4 xl:grid-cols-2">
				{filtered.map((app) => (
					<Card key={text(app.uuid)}>
						<CardHeader>
							<div className="flex items-start justify-between gap-3">
								<CardTitle>{text(app.name)}</CardTitle>
								<Badge
									variant={!query.isError && data.current === app.uuid ? "default" : "outline"}
								>
									{query.isError
										? "Estado não confirmado"
										: data.current === app.uuid
											? "Em execução"
											: "Disponível"}
								</Badge>
							</div>
							<CardDescription className="truncate font-mono">
								{text(app.cmd) || "Desktop / sem comando"}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							<Button variant="outline" onClick={() => setEditor(app)}>
								<IconEdit />
								Editar
							</Button>
							{data.current === app.uuid ? (
								<ConfirmedAction
									key={`close-${text(app.uuid)}`}
									label="Encerrar"
									disabled={query.isError}
									destructive
									description="Encerra o aplicativo atual e pode interromper sua sessão. Salve o progresso antes de continuar."
									execute={async () => {
										await action("apps/close")
										await refresh()
									}}
								/>
							) : (
								<ConfirmedAction
									key={`launch-${text(app.uuid)}`}
									label="Iniciar no host"
									disabled={query.isError}
									description={`Inicia ${text(app.name)} no computador. Pode encerrar o aplicativo atual e ativar display, comandos e encoder. Não inicia automaticamente o stream no celular.`}
									execute={async () => {
										await action("apps/launch", { uuid: app.uuid })
										await refresh()
									}}
								/>
							)}
							<ArtemisLaunch app={app} hostUuid={data.hostUuid} hostName={data.hostName} />
							<Button
								variant="ghost"
								onClick={() =>
									downloadFile(
										`${text(app.name)}.art`,
										launcherFile(app, data.hostUuid, data.hostName)
									)
								}
							>
								Exportar .art
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Subir ${text(app.name)}`}
								onClick={() => move(text(app.uuid), -1)}
								disabled={ordered[0]?.uuid === app.uuid}
							>
								<IconArrowUp />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Descer ${text(app.name)}`}
								onClick={() => move(text(app.uuid), 1)}
								disabled={ordered.at(-1)?.uuid === app.uuid}
							>
								<IconArrowDown />
							</Button>
							<ConfirmedAction
								label={`Excluir ${text(app.name)}`}
								destructive
								description="Remove somente a entrada da biblioteca do Apollo; não desinstala o jogo. Essa remoção não pode ser desfeita pelo painel."
								execute={async () => {
									await action("apps/delete", { uuid: app.uuid })
									setOrder(null)
									await refresh()
								}}
							/>
						</CardContent>
					</Card>
				))}
			</div>
		</>
	)
}
