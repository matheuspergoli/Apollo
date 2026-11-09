import { useEffect, useRef, useState } from "react"
import { ThemeSelect } from "@/components/theme-provider"
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CommandEditor } from "./command-editor"
import {
	addScript,
	applyPackage,
	type CommandDraft,
	type DemoPackage,
	discardDraft,
	draftChanged,
	examplePackage,
	inspectScript,
	type PrototypeState,
	removeResource,
	resourceUses,
	revisionFor,
	type Scenario,
	type ScriptFile,
	type Slot,
	saveSimulation,
	scriptLimit,
	slotNames,
	slots,
	validateDraft
} from "./model"

type Modal =
	| { kind: "file"; targetId?: string; slot?: Slot }
	| { kind: "inspect"; resourceId: string; revision: number }
	| { kind: "package"; bundle: DemoPackage }
	| { kind: "save" }
	| { kind: "discard" }
	| { kind: "delete"; resourceId: string }

const scenarios = [
	{ value: "success", label: "Confirmada" },
	{ value: "conflict", label: "Conflito de edição" },
	{ value: "expired", label: "Sessão expirada" },
	{ value: "unconfirmed", label: "Aplicada, mas sem confirmação" }
]

function ScriptContent({ file }: { file: ScriptFile }) {
	return (
		<section aria-label={`Conteúdo de ${file.name}`} className="min-w-0 space-y-2">
			<p className="break-all font-medium">{file.name}</p>
			<Textarea
				readOnly
				spellCheck={false}
				aria-label="Código somente para leitura"
				className="max-h-64 min-h-36 overscroll-contain font-mono text-xs"
				value={file.text}
			/>
			<p className="break-all text-muted-foreground text-xs">
				SHA-256: <span translate="no">{file.sha256}</span>
			</p>
			<p className="text-muted-foreground text-xs">
				Integridade não comprova segurança. Nenhum conteúdo é executado neste protótipo.
			</p>
		</section>
	)
}

export function ResourcesPreview({ initial }: { initial: PrototypeState }) {
	const [state, setState] = useState(initial)
	const [modal, setModal] = useState<Modal | null>(null)
	const [selectedFile, setSelectedFile] = useState<ScriptFile | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState("")
	const [notice, setNotice] = useState("")
	const [approved, setApproved] = useState(false)
	const [filter, setFilter] = useState("")
	const [scenario, setScenario] = useState<Scenario>("success")
	const [sessionExpired, setSessionExpired] = useState(false)
	const [needsRead, setNeedsRead] = useState(false)
	const [selectedRevisions, setSelectedRevisions] = useState<Record<string, number>>({})
	const fileInput = useRef<HTMLInputElement>(null)
	const returnFocus = useRef<HTMLElement | null>(null)
	const reading = useRef(0)
	const dirty = draftChanged(state)
	useEffect(() => {
		if (!dirty) return
		const guard = (event: BeforeUnloadEvent) => event.preventDefault()
		window.addEventListener("beforeunload", guard)
		return () => window.removeEventListener("beforeunload", guard)
	}, [dirty])
	function open(next: Modal) {
		returnFocus.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		reading.current++
		setModal(next)
		setSelectedFile(null)
		setApproved(false)
		setError("")
	}
	function attempt(action: () => void) {
		try {
			action()
			setError("")
		} catch (failure) {
			setError(
				failure instanceof Error ? failure.message : "Não foi possível concluir a simulação."
			)
		}
	}
	function editCommand(slot: Slot, command: CommandDraft) {
		setState((previous) => ({
			...previous,
			draft: { ...previous.draft, commands: { ...previous.draft.commands, [slot]: command } }
		}))
		setNotice("")
	}
	async function loadExample() {
		setBusy(true)
		setError("")
		try {
			open({ kind: "package", bundle: await examplePackage() })
		} catch (failure) {
			setError(
				failure instanceof Error ? failure.message : "O exemplo não pôde ser preparado."
			)
		} finally {
			setBusy(false)
		}
	}
	function save() {
		try {
			const next = saveSimulation(state, scenario)
			setState(next)
			setModal(null)
			setNeedsRead(scenario === "unconfirmed")
			setNotice(
				scenario === "unconfirmed"
					? "Sem confirmação na simulação. A operação pode ter sido aplicada; consulte a versão salva antes de repetir."
					: "Aplicativo salvo somente na memória da simulação. Nenhum arquivo ou comando foi enviado ao host."
			)
			setScenario("success")
			setError("")
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "A gravação simulada não pôde ser confirmada."
			)
			setModal(null)
			if (scenario === "expired") setSessionExpired(true)
			if (scenario === "conflict") {
				setNeedsRead(true)
				setState((previous) => ({
					...previous,
					version: previous.version + 1,
					saved: { ...previous.saved, name: `${previous.saved.name} (edição externa)` }
				}))
			}
		}
	}
	const inspect =
		modal?.kind === "inspect"
			? state.resources
					.find((item) => item.id === modal.resourceId)
					?.revisions.find((item) => item.number === modal.revision)
			: undefined
	const fileTarget =
		modal?.kind === "file" && modal.targetId
			? state.resources.find((item) => item.id === modal.targetId)
			: undefined
	const boundScripts = slots.filter((slot) => state.draft.commands[slot].source === "script")
	const visibleResources = state.resources.filter((resource) =>
		resource.name.toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR"))
	)
	return (
		<div className="min-h-svh bg-background text-foreground">
			<a
				href="#preview-content"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:p-3 focus:outline-2 focus:outline-ring"
			>
				Pular para o conteúdo
			</a>
			<header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4 md:px-8">
				<div className="flex min-w-0 flex-wrap items-center gap-3">
					<span className="font-semibold">Apollo</span>
					<Badge variant="outline">Protótipo local</Badge>
				</div>
				<ThemeSelect />
			</header>
			<main
				id="preview-content"
				tabIndex={-1}
				className="mx-auto max-w-7xl space-y-6 p-4 focus-visible:outline-2 focus-visible:outline-ring md:p-8"
			>
				<div>
					<h1 className="font-semibold text-3xl tracking-tight">Recursos gerenciados</h1>
					<p className="mt-2 max-w-3xl text-muted-foreground text-sm">
						Validação de interface para aplicativos, scripts e revisões. Os exemplos e as
						alterações existem apenas nesta página.
					</p>
				</div>
				<Alert>
					<AlertTitle>Sem conexão com o host</AlertTitle>
					<AlertDescription>
						Este protótipo não lê sua biblioteca, não envia arquivos, não executa scripts e não
						altera a instalação. Recarregar a página descarta os dados da simulação. O formato
						de pacote ainda não está definido.
					</AlertDescription>
				</Alert>
				{notice && (
					<p role="status" className="break-words border p-3 text-sm">
						{notice}
					</p>
				)}
				{error && !modal && (
					<Alert variant="destructive">
						<AlertTitle>Revise a operação</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{sessionExpired && (
					<Alert>
						<AlertTitle>Sessão expirada na simulação</AlertTitle>
						<AlertDescription>
							Seu rascunho continua disponível. Revalidar não repete a gravação.
						</AlertDescription>
						<Button
							variant="outline"
							className="mt-3"
							onClick={() => {
								setSessionExpired(false)
								setScenario("success")
								setNotice("Sessão revalidada na simulação. Nenhuma operação foi repetida.")
							}}
						>
							Revalidar sessão simulada
						</Button>
					</Alert>
				)}
				{needsRead && (
					<Alert>
						<AlertTitle>Consulte antes de repetir</AlertTitle>
						<AlertDescription>
							A consulta mostra o estado salvo na memória, sem reaplicar o rascunho.
						</AlertDescription>
						<Button
							variant="outline"
							className="mt-3"
							onClick={() => {
								setState((previous) => ({ ...previous, baseVersion: previous.version }))
								setNeedsRead(false)
								setScenario("success")
								setNotice(
									`Versão salva consultada: ${state.saved.name}. O rascunho foi preservado; nenhuma gravação foi repetida.`
								)
							}}
						>
							Consultar versão salva na simulação
						</Button>
					</Alert>
				)}
				<Tabs defaultValue="editor">
					<TabsList aria-label="Fluxos do protótipo" className="w-full sm:w-fit">
						<TabsTrigger value="editor">Editor do aplicativo</TabsTrigger>
						<TabsTrigger value="resources">Recursos</TabsTrigger>
					</TabsList>
					<TabsContent value="editor" className="mt-4 min-w-0 space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Arquivo do aplicativo</CardTitle>
								<CardDescription>
									O fluxo de JSON atual permanece intacto. Aqui, apenas a revisão de um pacote
									de exemplo é simulada.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button variant="outline" disabled={busy} onClick={() => void loadExample()}>
									Revisar pacote de exemplo
								</Button>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>Aplicativo de exemplo</CardTitle>
								<CardDescription>
									Recorte do editor existente; não substitui as opções atuais de dispositivos,
									configuração ou automação.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-5">
								<Field>
									<FieldLabel htmlFor="preview-name">Nome do aplicativo</FieldLabel>
									<Input
										id="preview-name"
										autoComplete="off"
										value={state.draft.name}
										onChange={(event) => {
											setState({
												...state,
												draft: { ...state.draft, name: event.target.value }
											})
											setNotice("")
										}}
									/>
								</Field>
								<div className="flex items-center gap-3">
									<Switch
										id="preview-elevated"
										checked={state.draft.elevated}
										onCheckedChange={(checked) =>
											setState({ ...state, draft: { ...state.draft, elevated: checked } })
										}
									/>
									<FieldLabel htmlFor="preview-elevated">
										Executar inicialização com privilégios elevados
									</FieldLabel>
								</div>
								<div className="flex items-center gap-3">
									<Switch
										id="preview-preparation-elevated"
										checked={state.draft.preparationElevated}
										onCheckedChange={(checked) =>
											setState({
												...state,
												draft: { ...state.draft, preparationElevated: checked }
											})
										}
									/>
									<FieldLabel htmlFor="preview-preparation-elevated">
										Executar preparação e desfazer com privilégios elevados
									</FieldLabel>
								</div>
								<p className="text-muted-foreground text-xs">
									Elevação nunca é concedida por importar um arquivo. O protótipo não executa
									comandos nem altera políticas do Windows.
								</p>
								<div className="space-y-5">
									{slots.map((slot) => (
										<CommandEditor
											key={slot}
											slot={slot}
											resources={state.resources}
											command={state.draft.commands[slot]}
											onChange={(command) => editCommand(slot, command)}
											onInspect={(resourceId, revision) =>
												open({ kind: "inspect", resourceId, revision })
											}
											onFile={(selectedSlot) => open({ kind: "file", slot: selectedSlot })}
										/>
									))}
								</div>
							</CardContent>
						</Card>
						<div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-4">
							<p className="text-muted-foreground text-xs">
								{dirty ? "Rascunho não salvo na simulação." : "Sem alterações no rascunho."}
							</p>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									disabled={!dirty || needsRead}
									onClick={() => open({ kind: "discard" })}
								>
									Descartar rascunho
								</Button>
								<Button
									disabled={!dirty || sessionExpired || needsRead}
									onClick={() =>
										attempt(() => {
											validateDraft(state)
											open({ kind: "save" })
										})
									}
								>
									Revisar e salvar na simulação
								</Button>
							</div>
						</div>
					</TabsContent>
					<TabsContent value="resources" className="mt-4 min-w-0 space-y-5">
						<div className="flex flex-wrap items-end justify-between gap-3">
							<Field className="max-w-md">
								<FieldLabel htmlFor="resource-search">Buscar recursos</FieldLabel>
								<Input
									id="resource-search"
									type="search"
									autoComplete="off"
									value={filter}
									onChange={(event) => setFilter(event.target.value)}
								/>
							</Field>
							<Button
								disabled={sessionExpired || needsRead}
								onClick={() => open({ kind: "file" })}
							>
								Adicionar script à biblioteca simulada
							</Button>
						</div>
						{!visibleResources.length && (
							<p className="border p-4 text-muted-foreground">
								{filter
									? "Nenhum recurso corresponde à busca. Altere o termo para continuar."
									: "Nenhum recurso na biblioteca simulada. Adicione um script deste dispositivo."}
							</p>
						)}
						{visibleResources.map((resource) => {
							const current =
								selectedRevisions[resource.id] || resource.revisions.at(-1)?.number || 1
							const uses = resourceUses(state, resource.id)
							const draftUses = slots.some(
								(slot) =>
									state.draft.commands[slot].source === "script" &&
									state.draft.commands[slot].resourceId === resource.id
							)
							return (
								<Card key={resource.id}>
									<CardHeader>
										<CardTitle className="break-all">{resource.name}</CardTitle>
										<CardDescription>
											PowerShell ·{" "}
											{resource.provisional ? "Somente no rascunho" : "Biblioteca simulada"}.
											Cópia independente do arquivo original.
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										<Field className="max-w-sm">
											<FieldLabel htmlFor={`library-${resource.id}`}>
												Revisão selecionada
											</FieldLabel>
											<Select
												items={resource.revisions.map((item) => ({
													value: String(item.number),
													label: `Revisão ${item.number}`
												}))}
												value={String(current)}
												onValueChange={(value) =>
													setSelectedRevisions({
														...selectedRevisions,
														[resource.id]: Number(value)
													})
												}
											>
												<SelectTrigger
													id={`library-${resource.id}`}
													aria-label={`Revisão de ${resource.name}`}
													className="w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{resource.revisions.map((item) => (
														<SelectItem key={item.number} value={String(item.number)}>
															Revisão {item.number}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
										<section
											aria-label={`Uso de ${resource.name}`}
											className="space-y-1 text-muted-foreground text-xs"
										>
											{uses.length ? (
												uses.map((use) => (
													<p key={`${use.uuid}-${use.slot}`}>
														{use.app}: {slotNames[use.slot]}, revisão {use.revision}.
													</p>
												))
											) : (
												<p>Sem vínculos salvos na simulação.</p>
											)}
											{draftUses && <p>Também selecionado no rascunho atual.</p>}
										</section>
										<div className="flex flex-wrap gap-2">
											<Button
												variant="outline"
												aria-label={`Ver conteúdo de ${resource.name}`}
												onClick={() =>
													open({ kind: "inspect", resourceId: resource.id, revision: current })
												}
											>
												Ver conteúdo
											</Button>
											<Button
												variant="outline"
												aria-label={`Adicionar revisão de ${resource.name}`}
												disabled={sessionExpired || needsRead || resource.provisional}
												onClick={() => open({ kind: "file", targetId: resource.id })}
											>
												Adicionar revisão
											</Button>
											<Button
												variant="destructive"
												aria-label={`Excluir ${resource.name}`}
												disabled={uses.length > 0 || draftUses || sessionExpired || needsRead}
												onClick={() => open({ kind: "delete", resourceId: resource.id })}
											>
												Excluir
											</Button>
										</div>
										{(uses.length > 0 || draftUses) && (
											<p className="text-muted-foreground text-xs">
												Exclusão bloqueada: remova os vínculos salvos e os do rascunho
												primeiro.
											</p>
										)}
									</CardContent>
								</Card>
							)
						})}
					</TabsContent>
				</Tabs>
				<details className="border p-4 text-sm">
					<summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
						Cenários de validação do protótipo
					</summary>
					<div className="mt-4 space-y-3">
						<p className="text-muted-foreground">
							Estes controles não fazem parte da interface de produção. Escolha o resultado da
							próxima tentativa de salvar o aplicativo.
						</p>
						<Field className="max-w-sm">
							<FieldLabel htmlFor="preview-scenario">Próxima gravação simulada</FieldLabel>
							<Select
								items={scenarios}
								value={scenario}
								onValueChange={(value) => {
									if (scenarios.some((item) => item.value === value))
										setScenario(value as Scenario)
								}}
							>
								<SelectTrigger id="preview-scenario" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{scenarios.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					</div>
				</details>
				<p className="text-muted-foreground text-xs">
					Não há exportação de pacotes, backup completo, gerenciador remoto de arquivos ou
					execução real nesta entrega.
				</p>
			</main>
			<Dialog
				open={modal !== null}
				onOpenChange={(next) => {
					if (!next && !busy) {
						reading.current++
						setModal(null)
						setError("")
					}
				}}
			>
				<DialogContent
					finalFocus={returnFocus}
					showCloseButton={!busy}
					className="max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-2xl"
				>
					<DialogHeader>
						<DialogTitle>
							{modal?.kind === "file"
								? fileTarget
									? "Adicionar revisão do script"
									: "Revisar script deste dispositivo"
								: modal?.kind === "inspect"
									? "Conteúdo do script"
									: modal?.kind === "package"
										? "Revisar pacote de exemplo"
										: modal?.kind === "save"
											? "Revisar gravação simulada"
											: modal?.kind === "delete"
												? "Excluir recurso da simulação?"
												: "Descartar rascunho?"}
						</DialogTitle>
						<DialogDescription>
							{modal?.kind === "file"
								? "O arquivo vem do dispositivo que abriu o painel. A cópia original não será alterada. Apenas UTF-8 e até 128 KiB nesta amostra."
								: modal?.kind === "save"
									? "Confira os eventos, revisões e privilégios. Nenhuma execução é realizada; a gravação existe somente na memória da página."
									: "Esta operação existe somente no protótipo. Nenhum dado será enviado ao host."}
						</DialogDescription>
					</DialogHeader>
					{error && (
						<Alert variant="destructive">
							<AlertTitle>Operação não concluída</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					{modal?.kind === "file" && (
						<>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => fileInput.current?.click()}
							>
								Selecionar script deste dispositivo
							</Button>
							<Input
								ref={fileInput}
								type="file"
								accept=".ps1"
								aria-label="Script PowerShell deste dispositivo"
								className="hidden"
								disabled={busy}
								onChange={async (event) => {
									const file = event.target.files?.[0]
									event.target.value = ""
									if (!file) return
									const request = ++reading.current
									setSelectedFile(null)
									setError("")
									setBusy(true)
									try {
										if (file.size > scriptLimit)
											throw new Error(
												"Selecione um script de até 128 KiB para este protótipo."
											)
										const selected = await inspectScript(
											file.name,
											new Uint8Array(await file.arrayBuffer())
										)
										if (request === reading.current) setSelectedFile(selected)
									} catch (failure) {
										if (request === reading.current)
											setError(
												failure instanceof Error
													? failure.message
													: "O arquivo não pôde ser lido."
											)
									} finally {
										if (request === reading.current) setBusy(false)
									}
								}}
							/>
							{busy && <p role="status">Lendo arquivo local…</p>}
							{selectedFile && <ScriptContent file={selectedFile} />}
							{fileTarget && (
								<p>
									Nova revisão de <strong>{fileTarget.name}</strong>. Os vínculos atuais
									continuarão nas revisões anteriores.
								</p>
							)}
						</>
					)}
					{modal?.kind === "inspect" &&
						(inspect?.available ? (
							<ScriptContent file={inspect} />
						) : (
							<p role="alert">A revisão não está disponível. Escolha outra revisão.</p>
						))}
					{modal?.kind === "package" && (
						<div className="space-y-4">
							<p>
								<strong>Aplicativo:</strong> {modal.bundle.name}. O UUID local será preservado
								nesta simulação.
							</p>
							<p>
								<strong>Execução:</strong> um script em Preparação. Inicialização, desfazer e
								elevação atuais não serão substituídos.
							</p>
							<Alert>
								<AlertTitle>Dependência externa para revisar</AlertTitle>
								<AlertDescription>{modal.bundle.dependency}</AlertDescription>
							</Alert>
							{modal.bundle.scripts.map((file) => (
								<ScriptContent key={file.sha256} file={file} />
							))}
							<p className="text-muted-foreground text-xs">
								Cancelar não altera o rascunho nem a biblioteca. Aplicar adiciona recursos
								provisórios apenas à memória do rascunho.
							</p>
						</div>
					)}
					{modal?.kind === "save" && (
						<div className="space-y-4">
							<p className="break-words">
								<strong>Aplicativo:</strong> {state.draft.name}
							</p>
							{slots.map((slot) => {
								const command = state.draft.commands[slot]
								return (
									<div key={slot} className="min-w-0 border p-3">
										<p className="font-medium">{slotNames[slot]}</p>
										<p className="break-all text-muted-foreground">
											{command.source === "manual"
												? command.manual ||
													(slot === "launch" ? "Desktop, sem comando" : "Sem comando")
												: `${state.resources.find((item) => item.id === command.resourceId)?.name} — revisão ${command.revision}`}
										</p>
										<p className="text-xs">
											Privilégios elevados:{" "}
											{(
												slot === "launch"
													? state.draft.elevated
													: state.draft.preparationElevated
											)
												? "sim"
												: "não"}
											.
										</p>
										{command.source === "script" && (
											<>
												<p className="break-all text-xs">
													Argumentos literais: {JSON.stringify(command.args)}
												</p>
												<Textarea
													readOnly
													spellCheck={false}
													aria-label={`Revisar código de ${slotNames[slot].toLocaleLowerCase("pt-BR")}`}
													className="mt-2 max-h-36 font-mono text-xs"
													value={revisionFor(state.resources, command)?.text || ""}
												/>
											</>
										)}
									</div>
								)
							})}
							{boundScripts.length > 0 && (
								<div className="flex items-start gap-3">
									<Switch
										id="preview-approval"
										checked={approved}
										onCheckedChange={setApproved}
									/>
									<FieldLabel htmlFor="preview-approval">
										Revisei os scripts, eventos e privilégios destes vínculos na simulação.
									</FieldLabel>
								</div>
							)}
						</div>
					)}
					{modal?.kind === "discard" && (
						<p>
							Descarta a edição e os scripts provisórios do pacote. Recursos adicionados
							explicitamente à biblioteca simulada permanecem nela.
						</p>
					)}
					{modal?.kind === "delete" && (
						<p>
							A exclusão afeta somente o recurso sem vínculos da biblioteca simulada. Nenhum
							arquivo original será removido.
						</p>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => {
								reading.current++
								setModal(null)
								setError("")
							}}
						>
							{modal?.kind === "inspect" ? "Fechar" : "Cancelar"}
						</Button>
						{modal?.kind === "file" && (
							<Button
								disabled={!selectedFile || busy || sessionExpired || needsRead}
								onClick={() =>
									attempt(() => {
										if (!selectedFile) return
										let next = addScript(state, selectedFile, modal.targetId)
										if (modal.slot) {
											const resource = next.resources.at(-1)
											if (!resource) return
											next = {
												...next,
												resources: next.resources.map((item) =>
													item.id === resource.id ? { ...item, provisional: true } : item
												),
												draft: {
													...next.draft,
													commands: {
														...next.draft.commands,
														[modal.slot]: {
															...next.draft.commands[modal.slot],
															source: "script",
															resourceId: resource.id,
															revision: 1,
															args: []
														}
													}
												}
											}
										}
										setState(next)
										setModal(null)
										setNotice(
											modal.slot
												? "Script aplicado somente ao rascunho. Salve o aplicativo na simulação para confirmar o vínculo."
												: "Recurso adicionado à biblioteca simulada. Nenhum vínculo existente foi alterado."
										)
									})
								}
							>
								{modal.slot
									? "Aplicar script ao rascunho"
									: fileTarget
										? "Adicionar revisão na simulação"
										: "Adicionar à biblioteca simulada"}
							</Button>
						)}
						{modal?.kind === "package" && (
							<Button
								onClick={() =>
									attempt(() => {
										setState(applyPackage(state, modal.bundle))
										setModal(null)
										setNotice(
											"Pacote aplicado somente ao rascunho. Revise os valores antes de salvar na simulação."
										)
									})
								}
							>
								Aplicar pacote ao rascunho
							</Button>
						)}
						{modal?.kind === "save" && (
							<Button
								disabled={
									sessionExpired || needsRead || (boundScripts.length > 0 && !approved)
								}
								onClick={save}
							>
								Salvar somente na simulação
							</Button>
						)}
						{modal?.kind === "discard" && (
							<Button
								variant="destructive"
								onClick={() => {
									setState(discardDraft(state))
									setModal(null)
									setNotice(
										"Rascunho descartado. O aplicativo salvo na simulação não foi alterado."
									)
								}}
							>
								Descartar rascunho na simulação
							</Button>
						)}
						{modal?.kind === "delete" && (
							<Button
								variant="destructive"
								onClick={() =>
									attempt(() => {
										setState(removeResource(state, modal.resourceId))
										setModal(null)
										setNotice("Recurso excluído somente da biblioteca simulada.")
									})
								}
							>
								Excluir somente na simulação
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
