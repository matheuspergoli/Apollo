import { createFileRoute } from "@tanstack/react-router"
import { DiagnosticsPage } from "@/pages/diagnostics"

export const Route = createFileRoute("/_host/troubleshooting")({ component: DiagnosticsPage })
