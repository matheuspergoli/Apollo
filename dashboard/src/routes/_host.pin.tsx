import { createFileRoute } from "@tanstack/react-router"
import { DevicesPage } from "@/pages/devices"

export const Route = createFileRoute("/_host/pin")({ component: DevicesPage })
