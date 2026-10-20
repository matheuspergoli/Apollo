import { createFileRoute } from "@tanstack/react-router"
import { ApplicationsPage } from "@/pages/applications"

export const Route = createFileRoute("/_host/apps")({ component: ApplicationsPage })
