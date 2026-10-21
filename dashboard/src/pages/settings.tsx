import { IconCheck, IconDeviceFloppy, IconSearch } from "@tabler/icons-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { UnsavedChanges } from "@/components/unsaved-changes"
import { SettingControl } from "@/features/settings/fields"
import {
	changedKeys,
	draftFrom,
	fingerprint,
	loadSnapshot,
	type Snapshot,
	serializeSettings,
	settingsOptions,
	visibleSections
} from "@/features/settings/model"
import { configOptions, post } from "@/lib/api"
import { accepted } from "@/lib/documents"

function Editor({ initial }: { initial: Snapshot }) {
	const client = useQueryClient()
	const navigate = useNavigate()
	const [baseline, setBaseline] = useState(initial)
	const [draft, setDraft] = useState(() => draftFrom(initial))
	const [filter, setFilter] = useState("")
	const groups = visibleSections(initial.platform)
	const [section, setSection] = useState(() => {
		const requested =
			new URLSearchParams(location.search).get("section") ||
			groups.find((group) =>
				group.fields.some((field) => field.key === location.hash.slice(1))
			)?.id
		return groups.some((group) => group.id === requested) ? requested || "general" : "general"
	})
	const [review, setReview] = useState(false)
	const [error, setError] = useState<Error | null>(null)
	const [saved, setSaved] = useState(false)
	const changes = changedKeys(draftFrom(baseline), draft)
	const dirty = changes.length > 0
	const save = useMutation({
		mutationFn: async () => {
			const payload = serializeSettings(draft)
			const current = await loadSnapshot()
			if (fingerprint(current) !== fingerprint(baseline))
				throw new Error(
					"O arquivo mudou em outra sessão. Seu rascunho foi mantido: recarregue e revise antes de sobrescrever alterações."
				)
			accepted(await post("config", payload))
			return payload
		},
		onSuccess: async (payload) => {
			const next = { ...baseline, values: payload }
			setBaseline(next)
			setDraft(draftFrom(next))
			setSaved(true)
			setReview(false)
			client.setQueryData(settingsOptions.queryKey, next)
			await client.invalidateQueries({ queryKey: configOptions.queryKey })
		}
	})
	const selected = groups.find((group) => group.id === section) || groups[0]
	const results = filter.trim()
		? groups
				.flatMap((group) => group.fields.map((field) => ({ group, field })))
				.filter(({ field }) =>
					`${field.label} ${field.key} ${field.description}`
						.toLocaleLowerCase()
						.includes(filter.toLocaleLowerCase())
				)
		: selected.fields.map((field) => ({ group: selected, field }))
	function change(key: string, value: unknown) {
		setDraft((previous) => ({ ...previous, [key]: value }))
		setSaved(false)
	}
	return (
		<>
			<UnsavedChanges dirty={dirty} pending={save.isPending} />
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="mb-2 text-muted-foreground text-xs uppercase tracking-widest">
						Preferências do host
					</p>
					<h1 className="font-semibold text-3xl tracking-tight">Configurações</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Arquivo declarado. Salvar não reinicia nem muda silenciosamente a sessão atual.
					</p>
				</div>
				<Badge variant={dirty ? "secondary" : "outline"}>
					{dirty ? `${changes.length} alterações pendentes` : "Sem alterações"}
				</Badge>
			</div>
			{saved && (
				<Alert role="status">
					<IconCheck />
					<AlertTitle>Arquivo salvo</AlertTitle>
					<AlertDescription>
						As alterações ainda podem exigir reinício do host. Revise a sessão antes de
						reiniciar.
					</AlertDescription>
				</Alert>
			)}
			<RequestError error={error || (!review ? save.error : null)} />
			<div className="relative">
				<IconSearch className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
				<Input
					id="settings-search"
					aria-label="Buscar configurações"
					placeholder="Buscar por opção, chave ou descrição…"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					className="h-11 pl-10"
				/>
			</div>
			<div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
				<nav
					aria-label="Grupos de configuração"
					className="flex gap-1 overflow-x-auto lg:sticky lg:top-24 lg:flex-col"
				>
					{groups.map((group) => (
						<Button
							key={group.id}
							variant={group.id === section && !filter ? "secondary" : "ghost"}
							className="min-h-10 shrink-0 justify-start"
							onClick={() => {
								setSection(group.id)
								setFilter("")
								void navigate({ to: "/config", search: { section: group.id }, replace: true })
							}}
						>
							{group.title}
						</Button>
					))}
				</nav>
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{filter ? `Resultados (${results.length})` : selected.title}</CardTitle>
						<CardDescription>
							{filter
								? "A busca inclui todos os grupos disponíveis para esta plataforma."
								: "Valores atuais e padrões explícitos. Nenhuma otimização é aplicada automaticamente."}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{results.length ? (
							results.map(({ field }) => (
								<SettingControl
									key={field.key}
									field={field}
									value={draft[field.key]}
									platform={initial.platform}
									onChange={(value) => change(field.key, value)}
								/>
							))
						) : (
							<p className="py-8 text-muted-foreground text-sm">
								Nenhuma opção encontrada. Tente outra palavra ou uma chave como nvenc_preset.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
			<div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border bg-background/95 p-4 shadow-sm backdrop-blur-sm">
				<p className="text-muted-foreground text-sm">
					{dirty
						? "Seu rascunho ainda não foi gravado."
						: "As configurações estão sincronizadas com sua última gravação."}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={!dirty || save.isPending}
						onClick={() => {
							setDraft(draftFrom(baseline))
							setError(null)
							save.reset()
						}}
					>
						Descartar rascunho
					</Button>
					<Button
						disabled={!dirty || save.isPending}
						onClick={() => {
							try {
								serializeSettings(draft)
								setError(null)
								setReview(true)
							} catch (failure) {
								setError(
									failure instanceof Error ? failure : new Error("Configuração inválida")
								)
							}
						}}
					>
						<IconDeviceFloppy />
						Revisar e salvar
					</Button>
					<ConfirmedAction
						label="Reiniciar host"
						description="Encerra o aplicativo e interrompe todos os streams. Uma execução manual pode não voltar automaticamente. Não salva rascunhos. A conexão pode cair sem confirmação: verifique o console e abra o host novamente se necessário."
						disabled={dirty || save.isPending}
						execute={() => post("restart", {}, false)}
						destructive
					/>
				</div>
			</div>
			<Dialog
				open={review}
				onOpenChange={(open) => {
					if (!save.isPending) setReview(open)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Salvar {changes.length} alterações?</DialogTitle>
						<DialogDescription>
							Revisão do arquivo. Comandos configurados podem executar no host quando os
							eventos correspondentes ocorrerem. O host não será reiniciado.
						</DialogDescription>
					</DialogHeader>
					<ul className="max-h-64 space-y-2 overflow-y-auto font-mono text-xs">
						{changes.map((key) => (
							<li key={key} className="border-b pb-2">
								{key}
								<span className="ml-2 text-muted-foreground">
									{typeof draft[key] === "object"
										? "estrutura atualizada"
										: String(draft[key]).slice(0, 120)}
								</span>
							</li>
						))}
					</ul>
					<RequestError error={save.error} />
					<DialogFooter>
						<Button
							variant="outline"
							disabled={save.isPending}
							onClick={() => setReview(false)}
						>
							Voltar
						</Button>
						<Button disabled={save.isPending} onClick={() => save.mutate()}>
							{save.isPending ? "Salvando…" : "Salvar arquivo"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

export function SettingsPage() {
	const config = useQuery(settingsOptions)
	if (config.isPending)
		return (
			<div className="space-y-4" role="status" aria-label="Carregando configurações">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-96 w-full" />
			</div>
		)
	if (config.error)
		return <RequestError error={config.error} retry={() => void config.refetch()} />
	return <Editor initial={config.data} />
}
