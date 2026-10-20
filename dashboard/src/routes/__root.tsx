import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import { RequestError } from "@/components/request-error"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	component: Outlet,
	pendingComponent: () => (
		<div role="status" aria-label="Carregando página" className="space-y-4 p-8">
			<Skeleton className="h-8 w-56" />
			<Skeleton className="h-64 w-full" />
		</div>
	),
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-2xl space-y-6 p-8">
			<h1 className="font-semibold text-2xl">Não foi possível abrir esta página</h1>
			<RequestError
				error={
					error instanceof Error ? error : new Error("Falha inesperada ao carregar a página.")
				}
			/>
			<Button onClick={() => window.location.reload()}>Recarregar painel</Button>
			<Link to="/" className="ml-4 underline">
				Visão geral
			</Link>
		</main>
	),
	notFoundComponent: () => (
		<main className="mx-auto max-w-xl space-y-4 p-8">
			<h1 className="font-semibold text-2xl">Página não encontrada</h1>
			<p className="text-muted-foreground">Este endereço não existe no painel Apollo.</p>
			<Link to="/" className="inline-block underline">
				Voltar à visão geral
			</Link>
		</main>
	)
})
