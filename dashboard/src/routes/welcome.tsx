import { createFileRoute } from "@tanstack/react-router"
import { AccessPage } from "@/pages/access"

export const Route = createFileRoute("/welcome")({ component: () => <AccessPage setup /> })
