import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"
import { action } from "@/lib/documents"
import type { SettingField } from "./model"
import { phaseLabels, windowStatusDescription, windowStatusOptions } from "./window-management"

export function WindowApplicationSelector({
	field,
	value,
	onChange
}: {
	field: SettingField
	value: unknown
	onChange: (value: unknown) => void
}) {
	const query = useQuery(windowStatusOptions)
	const selected = typeof value === "string" ? value : ""
	const choices = [
		{ value: "__none__", label: "Nenhum aplicativo" },
		...(query.data?.applications ?? []).map((app) => ({
			value: app.uuid,
			label: `${app.name} (${app.uuid})`
		}))
	]
	if (selected && !choices.some((choice) => choice.value === selected))
		choices.push({ value: selected, label: `Seleção atual indisponível (${selected})` })
	return (
		<Field className="gap-3 border-b pb-6">
			<FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
			<FieldDescription id={`${field.key}-help`}>{field.description}</FieldDescription>
			<p className="font-mono text-[11px] text-muted-foreground">{field.key}</p>
			<Select
				items={choices}
				value={selected || "__none__"}
				onValueChange={(next) => {
					if (typeof next === "string") onChange(next === "__none__" ? "" : next)
				}}
				disabled={query.isPending || query.isError}
			>
				<SelectTrigger
					id={field.key}
					aria-describedby={`${field.key}-help`}
					className="h-10 w-full sm:max-w-md"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{choices.map((choice) => (
						<SelectItem key={choice.value} value={choice.value}>
							{choice.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{query.isPending && (
				<p role="status" className="text-muted-foreground text-sm">
					Carregando aplicativos…
				</p>
			)}
			<RequestError error={query.error} retry={() => void query.refetch()} />
		</Field>
	)
}

export function WindowManagementStatus() {
	const query = useQuery(windowStatusOptions)
	const client = useQueryClient()
	const recover = useMutation({
		mutationFn: () => action("window-management/recover"),
		retry: false,
		onSuccess: () => client.invalidateQueries({ queryKey: windowStatusOptions.queryKey })
	})
	const state = query.data
	return (
		<section
			aria-label="Estado do gerenciamento de janelas"
			className="space-y-3 border-b pb-6"
		>
			<h3 className="font-medium">Estado da sessão em execução</h3>
			<p className="text-muted-foreground text-sm">
				Este estado usa a configuração carregada pelo host, não o rascunho abaixo. Salvar o
				arquivo pode exigir reinício para aplicar os ajustes.
			</p>
			<RequestError error={query.error || recover.error} />
			{query.isPending ? (
				<p role="status">Consultando estado…</p>
			) : (
				state && (
					<>
						<p className="text-sm">
							<strong>{phaseLabels[state.phase]}</strong> — {windowStatusDescription(state)}
						</p>
						<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
							{[
								["Movidas", state.moved],
								["Restauradas", state.restored],
								["Ignoradas", state.skipped],
								["Falhas", state.failed],
								["Excesso de eventos", state.overflow],
								["Último erro Win32", state.last_error]
							].map(([label, count]) => (
								<div key={label}>
									<dt className="text-muted-foreground">{label}</dt>
									<dd className="font-mono">{count}</dd>
								</div>
							))}
						</dl>
					</>
				)
			)}
			{recover.isSuccess && (
				<Alert role="status">
					<AlertTitle>Recuperação solicitada</AlertTitle>
					<AlertDescription>
						A solicitação foi enviada. Somente movimentos observados e confirmados aparecem na
						contagem; algumas janelas podem recusar a operação.
					</AlertDescription>
				</Alert>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					Atualizar estado
				</Button>
				<Button
					type="button"
					disabled={
						!state?.manual_available || query.isError || query.isPending || recover.isPending
					}
					onClick={() => recover.mutate()}
				>
					{recover.isPending ? "Solicitando…" : "Recuperar janelas agora"}
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				A recuperação manual age somente na sessão autorizada atual e pode estabelecer uma nova
				origem para janelas alteradas manualmente. Não restaura janelas minimizadas nem muda
				monitores.
			</p>
		</section>
	)
}
