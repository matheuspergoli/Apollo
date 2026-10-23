import { createFileRoute } from "@tanstack/react-router"
import { AccessPage } from "@/pages/access"

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): { created?: boolean } =>
		search.created === true || search.created === "true" ? { created: true } : {},
	component: LoginPage
})

function LoginPage() {
	return <AccessPage created={Route.useSearch().created} />
}
