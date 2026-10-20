import { createFileRoute } from "@tanstack/react-router"
import { SettingsPage } from "@/pages/settings"

export const Route = createFileRoute("/_host/config")({
	validateSearch: (search: Record<string, unknown>) => ({
		section: typeof search.section === "string" ? search.section : undefined
	}),
	component: SettingsPage
})
