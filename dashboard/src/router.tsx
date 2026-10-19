import type { QueryClient } from "@tanstack/react-query"
import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet
} from "@tanstack/react-router"
import { AccessPage } from "./pages/access"
import { OverviewPage } from "./pages/overview"

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	component: Outlet,
	notFoundComponent: () => (
		<main className="mx-auto max-w-xl p-8">
			<h1 className="font-semibold text-2xl">Tela ainda não migrada</h1>
			<p className="mt-4 text-muted-foreground">
				Use o painel atual para esta função. A migração não está pronta para substituí-lo.
			</p>
			<a href="/" className="mt-4 inline-block underline">
				Voltar à visão geral
			</a>
		</main>
	)
})
const routeTree = rootRoute.addChildren([
	createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage }),
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/welcome",
		component: () => <AccessPage setup />
	}),
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/login",
		component: () => <AccessPage />
	})
])

export function createAppRouter(queryClient: QueryClient) {
	return createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreload: false
	})
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>
	}
}
