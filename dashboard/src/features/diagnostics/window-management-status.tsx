import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { action } from "@/lib/documents"
import {
	diagnosticLabels,
	phaseLabels,
	windowDiagnosticDescription,
	windowStatusDescription,
	windowStatusOptions,
	windowUnconfirmedDescription
} from "./window-management"

export function WindowManagementStatus() {
	const query = useQuery(windowStatusOptions)
	const client = useQueryClient()
	const recover = useMutation({
		mutationFn: (_generation: number) => action("window-management/recover"),
		retry: false,
		onSuccess: () => client.invalidateQueries({ queryKey: windowStatusOptions.queryKey })
	})
	const state = query.data
	return (
		<section aria-label="Estado do gerenciamento de janelas" className="space-y-3">
			<h3 className="font-medium">Estado da sessão em execução</h3>
			<p className="text-muted-foreground text-sm">
				Este estado usa a configuração carregada pelo host. Alterar as opções em Configurações
				pode exigir reinício para aplicar os ajustes.
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
						<p className="text-muted-foreground text-xs">
							Geração {state.generation}. Contadores desta sessão, não um histórico do host.
						</p>
						{state.recovery_required &&
							(state.phase === "active" || state.phase === "paused") && (
								<Alert>
									<AlertTitle>Recuperação manual recomendada</AlertTitle>
									<AlertDescription>
										Uma interrupção invalidou o controle anterior. Voltar ao estado ativo não
										reassume essas janelas. Quando a sessão permitir, use Recuperar janelas
										agora se desejar estabelecer uma nova origem; alterações manuais não são
										desfeitas automaticamente.
									</AlertDescription>
								</Alert>
							)}
						<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
							{[
								["Movidas", state.moved],
								["Restauradas", state.restored],
								["Ignoradas", state.skipped],
								["Falhas", state.failed],
								["Limites excedidos", state.overflow],
								["Código Win32 do diagnóstico", state.last_error]
							].map(([label, count]) => (
								<div key={label}>
									<dt className="text-muted-foreground">{label}</dt>
									<dd className="font-mono">{count}</dd>
								</div>
							))}
						</dl>
						<details className="text-sm">
							<summary>Diagnósticos das operações</summary>
							<p className="mt-3">{windowDiagnosticDescription(state)}</p>
							<p className="mt-3">{windowUnconfirmedDescription(state)}</p>
							<dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
								{Object.entries(diagnosticLabels).map(([key, label]) => (
									<div key={key}>
										<dt className="text-muted-foreground">{label}</dt>
										<dd className="font-mono">
											{state.diagnostics[key as keyof typeof diagnosticLabels]}
										</dd>
									</div>
								))}
							</dl>
							<p className="mt-3 text-muted-foreground text-xs">
								São ocorrências e tentativas, não quantidades de aplicativos. Categorias podem
								se sobrepor. Uma recusa de inspeção não comprova falha de movimentação; somente
								resultados confirmados contam como movidos ou restaurados.
							</p>
						</details>
					</>
				)
			)}
			{recover.isSuccess &&
				state?.phase === "active" &&
				!query.isError &&
				recover.variables === state.generation && (
					<Alert role="status">
						<AlertTitle>Recuperação solicitada</AlertTitle>
						<AlertDescription>
							A solicitação foi enviada. Somente movimentos observados e confirmados aparecem
							na contagem; algumas janelas podem recusar a operação.
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
					onClick={() => {
						if (state) recover.mutate(state.generation)
					}}
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
