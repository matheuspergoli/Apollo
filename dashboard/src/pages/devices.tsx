import { IconDeviceDesktop, IconPlus, IconRefresh, IconShieldLock } from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { CommandList } from "@/components/command-list"
import { ConfirmedAction } from "@/components/confirmed-action"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UnsavedChanges } from "@/components/unsaved-changes"
import { DeviceConfigurationControls } from "@/features/devices/configuration-controls"
import {
	deviceDraft,
	pairingLink,
	permissions,
	serializeDevice
} from "@/features/devices/model"
import { comparable } from "@/features/settings/model"
import { action, bool, clientsOptions, type Document, text } from "@/lib/documents"

function Pairing({ refresh }: { refresh: () => Promise<unknown> }) {
	const [open, setOpen] = useState(false)
	const [name, setName] = useState("")
	const [pin, setPin] = useState("")
	const [phrase, setPhrase] = useState("")
	const [host, setHost] = useState("")
	const [port, setPort] = useState(
		String(Number(location.port) ? Number(location.port) - 1 : 47989)
	)
	const [deadline, setDeadline] = useState(0)
	const [remaining, setRemaining] = useState(0)
	const [qr, setQr] = useState("")
	const [localError, setLocalError] = useState<Error | null>(null)
	const pair = useMutation({
		mutationFn: () => action("pin", { pin, name }),
		gcTime: 0,
		onSuccess: async () => {
			setPin("")
			await refresh()
		}
	})
	const otp = useMutation({
		mutationFn: async () => {
			const started = performance.now()
			const response = await action("otp", { passphrase: phrase, deviceName: name })
			setDeadline(started + 180_000)
			if (!host)
				setHost(
					["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
						? text(response.ip)
						: location.hostname
				)
			return response
		},
		gcTime: 0
	})
	useEffect(() => {
		if (!deadline) return
		const tick = () =>
			setRemaining(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)))
		tick()
		const timer = setInterval(tick, 1000)
		return () => clearInterval(timer)
	}, [deadline])
	let link = ""
	if (otp.data && remaining > 0) {
		try {
			link = pairingLink(host, port, text(otp.data.otp), phrase, text(otp.data.name))
		} catch {
			/* Fields can be incomplete while editing. */
		}
	}
	useEffect(() => {
		let cancelled = false
		if (!link) {
			setQr("")
			return
		}
		QRCode.toDataURL(link, { width: 256, margin: 2 })
			.then((value) => {
				if (!cancelled) setQr(value)
			})
			.catch(() => {
				if (!cancelled)
					setLocalError(
						new Error("Não foi possível criar o QR. Use o código e o link manual.")
					)
			})
		return () => {
			cancelled = true
		}
	}, [link])
	return (
		<>
			<Button onClick={() => setOpen(true)}>
				<IconPlus />
				Vincular dispositivo
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Vincular ao Apollo</DialogTitle>
						<DialogDescription>
							Use o PIN exibido no cliente ou gere um código temporário para o Artemis. Revise
							as permissões depois de vincular.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel htmlFor="pair-name">Nome do dispositivo</FieldLabel>
						<Input
							id="pair-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Galaxy S25+"
						/>
					</Field>
					<Tabs defaultValue="pin">
						<TabsList className="w-full shrink-0">
							<TabsTrigger value="pin">PIN do cliente</TabsTrigger>
							<TabsTrigger value="otp">Código temporário / QR</TabsTrigger>
						</TabsList>
						<TabsContent value="pin" className="pt-3">
							<form
								className="space-y-3"
								onSubmit={(event) => {
									event.preventDefault()
									if (!pair.isPending) pair.mutate()
								}}
							>
								<Field>
									<FieldLabel htmlFor="pair-pin">PIN</FieldLabel>
									<Input
										id="pair-pin"
										inputMode="numeric"
										pattern="[0-9]{4}"
										maxLength={4}
										value={pin}
										onChange={(event) => setPin(event.target.value)}
										autoComplete="off"
										required
									/>
									<FieldDescription>
										Quatro dígitos exibidos pelo Artemis ao solicitar o pareamento.
									</FieldDescription>
								</Field>
								<Button type="submit" disabled={pair.isPending}>
									{pair.isPending ? "Vinculando…" : "Confirmar PIN"}
								</Button>
								<RequestError error={pair.error} />
								{pair.isSuccess && (
									<Alert role="status">
										<AlertTitle>Dispositivo vinculado</AlertTitle>
										<AlertDescription>
											Agora confira quais permissões ele deve receber.
										</AlertDescription>
									</Alert>
								)}
							</form>
						</TabsContent>
						<TabsContent value="otp" className="space-y-3 pt-3">
							<Field>
								<FieldLabel htmlFor="pair-phrase">Frase de pareamento</FieldLabel>
								<Input
									id="pair-phrase"
									type="password"
									autoComplete="new-password"
									value={phrase}
									onChange={(event) => {
										setPhrase(event.target.value)
										if (otp.data) {
											otp.reset()
											setDeadline(0)
										}
									}}
									minLength={4}
								/>
								<FieldDescription>
									Pelo menos quatro caracteres. Não é a senha do painel.
								</FieldDescription>
							</Field>
							<Button
								disabled={otp.isPending || phrase.length < 4}
								onClick={() => otp.mutate()}
							>
								{otp.isPending ? "Gerando…" : "Gerar código temporário"}
							</Button>
							<RequestError error={otp.error || localError} />
							{otp.data && (
								<div className="grid gap-4 border p-3 sm:grid-cols-[minmax(0,1fr)_192px]">
									<div className="space-y-3">
										<Badge variant={remaining ? "secondary" : "destructive"}>
											{remaining
												? `Expira em aproximadamente ${remaining}s`
												: "Código expirado"}
										</Badge>
										<p className="font-mono text-3xl tracking-widest">
											{remaining ? text(otp.data.otp) : "—"}
										</p>
										<div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
											<Field>
												<FieldLabel htmlFor="pair-host">Endereço do host</FieldLabel>
												<Input
													id="pair-host"
													value={host}
													onChange={(event) => setHost(event.target.value)}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="pair-port">Porta</FieldLabel>
												<Input
													id="pair-port"
													value={port}
													onChange={(event) => setPort(event.target.value)}
													inputMode="numeric"
												/>
											</Field>
										</div>
										{link && (
											<div className="flex flex-wrap gap-2">
												<a href={link} className={buttonVariants({ variant: "default" })}>
													Abrir no Artemis
												</a>
												<Button
													variant="outline"
													onClick={() => {
														navigator.clipboard
															.writeText(link)
															.catch(() =>
																setLocalError(
																	new Error(
																		"Não foi possível copiar. Abra pelo link ou use o código."
																	)
																)
															)
													}}
												>
													Copiar link
												</Button>
											</div>
										)}
									</div>
									{qr && remaining > 0 && (
										<img
											src={qr}
											alt="QR de pareamento do Artemis"
											className="mx-auto size-40 max-w-full self-center bg-white sm:size-48"
										/>
									)}
								</div>
							)}
						</TabsContent>
					</Tabs>
				</DialogContent>
			</Dialog>
		</>
	)
}

function DeviceEditor({
	original,
	onClose,
	onSaved
}: {
	original: Document
	onClose: () => void
	onSaved: () => Promise<unknown>
}) {
	const [draft, setDraft] = useState(() => deviceDraft(original))
	const mutation = useMutation({
		mutationFn: () => action("clients/update", serializeDevice(draft)),
		onSuccess: async () => {
			await onSaved()
			onClose()
		}
	})
	const mask = Number(draft.perm) || 0
	const changed = comparable(draft) !== comparable(deviceDraft(original))
	const set = (key: string, value: unknown) =>
		setDraft((previous) => ({ ...previous, [key]: value }))
	return (
		<>
			<UnsavedChanges dirty={changed} pending={mutation.isPending} />
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-widest">
						Dispositivos / permissões
					</p>
					<h1 className="mt-2 font-semibold text-3xl tracking-tight">
						{text(original.name) || "Dispositivo"}
					</h1>
				</div>
				{changed ? (
					<ConfirmedAction
						label="Cancelar edição"
						description="Descarta os ajustes de dispositivo que ainda não foram salvos. As permissões no host permanecem intactas."
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
			<DeviceConfigurationControls
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
						<CardTitle>Identificação e display</CardTitle>
						<CardDescription>
							Os ajustes são exclusivos deste cliente. Salvar aplica permissões e pode
							desconectá-lo se a visualização for revogada; não remove o pareamento dos demais.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="device-name">Nome</FieldLabel>
								<Input
									id="device-name"
									value={text(draft.name)}
									onChange={(event) => set("name", event.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="device-mode">Modo de display específico</FieldLabel>
								<Input
									id="device-mode"
									value={text(draft.display_mode)}
									onChange={(event) => set("display_mode", event.target.value)}
									placeholder="1920x1080x120"
								/>
								<FieldDescription>
									Vazio mantém o pedido do cliente. Aceita FPS fracionário, como 59.94.
								</FieldDescription>
							</Field>
							{[
								["enable_legacy_ordering", "Ordenação legada de aplicativos"],
								["always_use_virtual_display", "Sempre usar display virtual"],
								["allow_client_commands", "Permitir comandos do cliente"]
							].map(([key, label]) => (
								<Field key={key} orientation="horizontal">
									<FieldLabel htmlFor={`device-${key}`}>{label}</FieldLabel>
									<Switch
										id={`device-${key}`}
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
						<CardTitle className="flex items-center gap-2">
							<IconShieldLock className="size-4" />
							Permissões
						</CardTitle>
						<CardDescription>
							Privilégios concedidos ao dispositivo, não ao usuário do painel. Nenhuma
							permissão é ampliada automaticamente.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="flex flex-wrap gap-2">
							<Button type="button" variant="outline" onClick={() => set("perm", 0x03000000)}>
								Somente visualizar
							</Button>
							<Button type="button" variant="outline" onClick={() => set("perm", 0x071f1f00)}>
								Controle completo
							</Button>
							<Button type="button" variant="outline" onClick={() => set("perm", 0)}>
								Revogar todas
							</Button>
							<Badge variant="outline" className="font-mono">
								0x{mask.toString(16).padStart(8, "0")}
							</Badge>
						</div>
						{["Sessão", "Entrada", "Operações"].map((group) => (
							<section key={group} className="space-y-4">
								<h2 className="border-b pb-2 font-medium text-sm">{group}</h2>
								{permissions
									.filter((permission) => permission.group === group)
									.map((permission) => {
										const implied = Boolean(
											permission.suppressedBy && mask & permission.suppressedBy
										)
										return (
											<Field key={permission.key} orientation="horizontal">
												<div className="flex-1 space-y-1">
													<FieldLabel htmlFor={`permission-${permission.key}`}>
														{permission.label}
													</FieldLabel>
													<FieldDescription>
														{permission.help}
														{implied ? " Incluída pela permissão de iniciar aplicativos." : ""}
													</FieldDescription>
												</div>
												<Switch
													id={`permission-${permission.key}`}
													disabled={implied}
													checked={implied || Boolean(mask & permission.bit)}
													onCheckedChange={() => set("perm", mask ^ permission.bit)}
												/>
											</Field>
										)
									})}
							</section>
						))}
						{Boolean(mask & 0x001f0000) && (
							<Alert>
								<AlertTitle>Permissões sensíveis</AlertTitle>
								<AlertDescription>
									Área de transferência, arquivos e comandos podem expor dados ou executar
									ações no computador. Conceda somente a dispositivos confiáveis.
								</AlertDescription>
							</Alert>
						)}
					</CardContent>
				</Card>
				{bool(draft.allow_client_commands) && (
					<Card>
						<CardHeader>
							<CardTitle>Comandos de conexão</CardTitle>
							<CardDescription>
								Executados no computador quando este cliente conecta e desconecta. Revise
								elevação.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{["do", "undo"].map((key) => (
								<section key={key} className="space-y-3">
									<h2 className="font-medium text-sm">
										{key === "do" ? "Ao conectar" : "Ao desconectar"}
									</h2>
									<CommandList
										id={`client-${key}`}
										value={draft[key]}
										columns={[{ key: "cmd", label: "Comando" }]}
										onChange={(value) => set(key, value)}
									/>
								</section>
							))}
						</CardContent>
					</Card>
				)}
				<Card
					data-slot="editor-actions"
					className="sticky bottom-0 z-20 w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 bg-card/95 px-(--card-spacing) shadow-sm backdrop-blur-sm"
				>
					<Button type="submit" disabled={mutation.isPending}>
						{mutation.isPending ? "Salvando…" : "Salvar dispositivo"}
					</Button>
				</Card>
			</form>
		</>
	)
}

export function DevicesPage() {
	const query = useQuery(clientsOptions)
	const client = useQueryClient()
	const [editor, setEditor] = useState<Document | null>(null)
	const [filter, setFilter] = useState("")
	const refresh = () => client.invalidateQueries({ queryKey: clientsOptions.queryKey })
	if (query.isPending) return <Skeleton className="h-80 w-full" />
	if (query.error)
		return <RequestError error={query.error} retry={() => void query.refetch()} />
	if (editor)
		return (
			<DeviceEditor
				key={text(editor.uuid)}
				original={editor}
				onClose={() => setEditor(null)}
				onSaved={refresh}
			/>
		)
	const devices = query.data.clients.filter((device) =>
		text(device.name).toLocaleLowerCase().includes(filter.toLocaleLowerCase())
	)
	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-xs uppercase tracking-widest">
						Clientes autorizados
					</p>
					<h1 className="mt-2 font-semibold text-3xl tracking-tight">Dispositivos</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{query.data.clients.length} vinculados · permissões, pareamento e sessões.
					</p>
				</div>
				<Pairing refresh={refresh} />
			</div>
			<div className="flex flex-wrap gap-3">
				<Input
					aria-label="Buscar dispositivos"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					placeholder="Buscar por nome…"
					className="max-w-md"
				/>
				<Button
					variant="outline"
					onClick={() => void query.refetch()}
					disabled={query.isFetching}
				>
					<IconRefresh />
					Atualizar
				</Button>
				<ConfirmedAction
					label="Desvincular todos"
					destructive
					disabled={!query.data.clients.length}
					description="Revoga o pareamento de todos os dispositivos. Eles precisarão ser vinculados novamente. O acesso ao painel não é apagado."
					execute={async () => {
						await action("clients/unpair-all")
						await refresh()
					}}
				/>
			</div>
			{!devices.length && (
				<Alert role="status">
					<AlertTitle>Nenhum dispositivo encontrado</AlertTitle>
					<AlertDescription>
						Vincule seu Artemis ou ajuste a busca. Nenhuma autorização é criada
						automaticamente.
					</AlertDescription>
				</Alert>
			)}
			<div className="grid gap-4 xl:grid-cols-2">
				{devices.map((device) => (
					<Card key={text(device.uuid)}>
						<CardHeader>
							<div className="flex items-center justify-between gap-3">
								<CardTitle className="flex items-center gap-2">
									<IconDeviceDesktop className="size-4" />
									{text(device.name) || "Sem nome"}
								</CardTitle>
								<Badge variant={device.connected === true ? "default" : "outline"}>
									{typeof device.connected === "boolean"
										? device.connected
											? "Conectado"
											: "Desconectado"
										: "Estado não informado"}
								</Badge>
							</div>
							<CardDescription className="font-mono text-xs">
								{text(device.uuid)}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							<Button variant="outline" onClick={() => setEditor(device)}>
								Editar permissões
							</Button>
							{device.connected === true && (
								<ConfirmedAction
									label="Desconectar"
									description="Encerra a conexão atual deste cliente, sem revogar o pareamento."
									execute={async () => {
										await action("clients/disconnect", { uuid: device.uuid })
										await refresh()
									}}
								/>
							)}
							<ConfirmedAction
								label={`Desvincular ${text(device.name) || "dispositivo"}`}
								destructive
								description="Revoga o pareamento deste cliente. Será necessário vinculá-lo novamente para conectar."
								execute={async () => {
									await action("clients/unpair", { uuid: device.uuid })
									await refresh()
								}}
							/>
						</CardContent>
					</Card>
				))}
			</div>
			<p className="text-muted-foreground text-xs">
				Estado consultado às {new Date(query.dataUpdatedAt).toLocaleTimeString("pt-BR")}. Use
				Atualizar para uma nova leitura.
			</p>
		</>
	)
}
