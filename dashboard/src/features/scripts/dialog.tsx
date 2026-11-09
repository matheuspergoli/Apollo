import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { RequestError } from "@/components/request-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { action } from "@/lib/documents"
import {
	decodeScript,
	loadScript,
	readScriptFile,
	type ScriptFile,
	type ScriptRecord,
	type ScriptReference,
	scriptsOptions
} from "./model"

type Selection = { reference: ScriptReference; file: ScriptFile; target?: ScriptRecord }

// Mounted only while open: closing a read cannot later apply an old selection.
export function ScriptsDialog({
	onClose,
	onSelect
}: {
	onClose: () => void
	onSelect?: (reference: ScriptReference) => void
}) {
	const query = useQuery(scriptsOptions)
	const client = useQueryClient()
	const input = useRef<HTMLInputElement>(null)
	const target = useRef<ScriptRecord | undefined>(undefined)
	const [filter, setFilter] = useState("")
	const [selected, setSelected] = useState<Selection | null>(null)
	const [deleting, setDeleting] = useState<ScriptRecord | null>(null)
	const [versions, setVersions] = useState<Record<string, string>>({})
	const [notice, setNotice] = useState("")
	const read = useMutation({
		mutationFn: async (reference: ScriptReference) => ({
			reference,
			file: await loadScript(reference)
		}),
		onSuccess: (selection) => setSelected(selection)
	})
	const local = useMutation({
		mutationFn: readScriptFile,
		onSuccess: (file) => setSelected({ reference: { file }, file, target: target.current })
	})
	const write = useMutation({
		mutationFn: async () => {
			if (!selected) throw new Error("Selecione um arquivo.")
			return action("scripts", {
				...selected.file,
				...(selected.target ? { id: selected.target.id } : {})
			})
		},
		onSuccess: async () => {
			setSelected(null)
			setNotice("Script salvo.")
			await client.invalidateQueries({ queryKey: scriptsOptions.queryKey })
		}
	})
	const remove = useMutation({
		mutationFn: async () => action("scripts/delete", { id: deleting?.id }),
		onSuccess: async () => {
			setDeleting(null)
			setNotice("Script excluído.")
			await client.invalidateQueries({ queryKey: scriptsOptions.queryKey })
		}
	})
	const busy = write.isPending || remove.isPending || local.isPending || read.isPending
	const error = query.error || local.error || read.error || write.error || remove.error
	function chooseFile(resource?: ScriptRecord) {
		target.current = resource
		local.reset()
		read.reset()
		write.reset()
		remove.reset()
		setNotice("")
		input.current?.click()
	}
	function back() {
		setSelected(null)
		setDeleting(null)
		local.reset()
		read.reset()
		write.reset()
		remove.reset()
	}
	const scripts =
		query.data?.scripts.filter((script) =>
			script.name.toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR"))
		) || []
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose()
			}}
		>
			<DialogContent
				showCloseButton={!busy}
				className="max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-2xl"
			>
				<DialogHeader>
					<DialogTitle>
						{deleting
							? "Excluir script?"
							: selected
								? selected.target
									? "Salvar nova versão"
									: onSelect
										? "Usar este script?"
										: "Script"
								: onSelect
									? "Escolher script"
									: "Scripts"}
					</DialogTitle>
					<DialogDescription>
						{deleting
							? deleting.name
							: selected
								? selected.file.name
								: "Seus scripts PowerShell, guardados no Apollo."}
					</DialogDescription>
				</DialogHeader>
				<RequestError
					error={error}
					retry={query.error ? () => void query.refetch() : undefined}
				/>
				{notice && <p role="status">{notice}</p>}
				{busy && (
					<p role="status">
						{write.isPending
							? "Salvando script…"
							: remove.isPending
								? "Excluindo script…"
								: "Lendo script…"}
					</p>
				)}
				<Input
					ref={input}
					className="hidden"
					type="file"
					accept=".ps1"
					aria-label="Adicionar script deste dispositivo"
					disabled={busy}
					onChange={(event) => {
						const file = event.target.files?.[0]
						event.target.value = ""
						if (file) {
							setSelected(null)
							local.mutate(file)
						}
					}}
				/>
				{deleting ? (
					<p>
						O arquivo será removido da biblioteca. Scripts vinculados a aplicativos ou em
						execução não podem ser excluídos.
					</p>
				) : selected ? (
					<div className="min-w-0 space-y-3">
						<Textarea
							readOnly
							spellCheck={false}
							aria-label="Conteúdo do script"
							value={decodeScript(selected.file.data).text}
							className="max-h-64 min-h-48 overscroll-contain font-mono text-xs"
						/>
						<p className="text-muted-foreground text-xs">
							{selected.target
								? "Os aplicativos permanecem nas versões que já utilizam."
								: onSelect
									? "O vínculo será aplicado ao rascunho. O aplicativo só muda ao salvar."
									: "O script só executa quando estiver vinculado a uma ação de aplicativo."}
						</p>
					</div>
				) : (
					<>
						<div className="flex flex-wrap items-end justify-between gap-3">
							<Field className="max-w-sm">
								<FieldLabel htmlFor="script-search">Buscar scripts</FieldLabel>
								<Input
									id="script-search"
									type="search"
									autoComplete="off"
									value={filter}
									onChange={(event) => setFilter(event.target.value)}
								/>
							</Field>
							<Button
								variant="outline"
								disabled={busy || query.data?.supported === false}
								onClick={() => chooseFile()}
							>
								Adicionar script
							</Button>
						</div>
						{query.isPending && <p role="status">Carregando scripts…</p>}
						{query.data?.supported === false && (
							<p>Scripts gerenciados exigem um host Windows.</p>
						)}
						{query.isSuccess && query.data.supported && scripts.length === 0 && (
							<p className="text-muted-foreground">
								{filter
									? "Nenhum script encontrado."
									: "Nenhum script salvo. Adicione um arquivo .ps1 deste dispositivo."}
							</p>
						)}
						<div className="space-y-3">
							{scripts.map((script) => {
								const revision =
									script.revisions.find((item) => item.revision === versions[script.id]) ||
									script.revisions.at(-1)
								if (!revision) return null
								return (
									<section
										key={script.id}
										aria-label={script.name}
										className="min-w-0 space-y-3 border p-3"
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<h2 className="break-all font-medium">{script.name}</h2>
											<Badge variant="outline">PowerShell</Badge>
										</div>
										{script.revisions.length > 1 ? (
											<fieldset
												className="flex flex-wrap gap-2"
												aria-label={`Versões de ${script.name}`}
											>
												{script.revisions.map((version) => (
													<Button
														key={version.revision}
														variant={
															version.revision === revision.revision ? "secondary" : "ghost"
														}
														size="sm"
														aria-pressed={version.revision === revision.revision}
														disabled={busy}
														onClick={() =>
															setVersions({ ...versions, [script.id]: version.revision })
														}
													>
														Versão {version.number}
													</Button>
												))}
											</fieldset>
										) : (
											<p className="text-muted-foreground text-xs">Versão {revision.number}</p>
										)}
										{script.uses.length > 0 && (
											<p className="break-words text-muted-foreground text-xs">
												Usado por {script.uses.map((use) => use.name).join(", ")}.
											</p>
										)}
										<div className="flex flex-wrap gap-2">
											<Button
												variant={onSelect ? "default" : "outline"}
												disabled={busy}
												aria-label={`${onSelect ? "Escolher" : "Ver"} ${script.name}`}
												onClick={() =>
													read.mutate({
														id: script.id,
														revision: revision.revision,
														name: script.name,
														number: revision.number,
														arguments: []
													})
												}
											>
												{onSelect ? "Escolher" : "Ver conteúdo"}
											</Button>
											{!onSelect && (
												<>
													<Button
														variant="outline"
														disabled={busy}
														aria-label={`Nova versão de ${script.name}`}
														onClick={() => chooseFile(script)}
													>
														Nova versão
													</Button>
													<Button
														variant="outline"
														disabled={busy || script.uses.length > 0}
														aria-label={`Excluir ${script.name}`}
														title={
															script.uses.length
																? "Remova os vínculos dos aplicativos antes de excluir."
																: undefined
														}
														onClick={() => setDeleting(script)}
													>
														Excluir
													</Button>
												</>
											)}
										</div>
									</section>
								)
							})}
						</div>
					</>
				)}
				<DialogFooter>
					{selected || deleting ? (
						<Button variant="outline" disabled={busy} onClick={back}>
							Voltar
						</Button>
					) : (
						<Button variant="outline" disabled={busy} onClick={onClose}>
							Fechar
						</Button>
					)}
					{deleting && (
						<Button variant="destructive" disabled={busy} onClick={() => remove.mutate()}>
							Excluir script
						</Button>
					)}
					{selected && onSelect && (
						<Button
							disabled={busy}
							onClick={() => {
								onSelect(selected.reference)
								onClose()
							}}
						>
							Usar script
						</Button>
					)}
					{selected && !onSelect && "file" in selected.reference && (
						<Button disabled={busy} onClick={() => write.mutate()}>
							Salvar script
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
