import {
	IconAdjustments,
	IconApps,
	IconDeviceDesktop,
	IconGauge,
	IconKey,
	IconLifebuoy,
	IconSettings
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar
} from "@/components/ui/sidebar"
import { configOptions } from "@/lib/api"
import { HostActionNotice, HostActionsProvider, QuickHostRestart } from "./host-actions"
import { ThemeSelect } from "./theme-provider"

const navigation = [
	{ to: "/", label: "Visão geral", icon: IconGauge },
	{ to: "/pin", label: "Dispositivos", icon: IconDeviceDesktop },
	{ to: "/apps", label: "Aplicativos", icon: IconApps },
	{ to: "/config", label: "Configurações", icon: IconSettings },
	{ to: "/troubleshooting", label: "Diagnóstico", icon: IconLifebuoy },
	{ to: "/password", label: "Acesso e senha", icon: IconKey }
] as const

function HostNavigation() {
	const path = useRouterState({ select: (state) => state.location.pathname })
	const { setOpenMobile } = useSidebar()
	const config = useQuery(configOptions)
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="h-16 shrink-0 justify-center border-b px-2 py-0">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							render={<Link to="/" />}
							onClick={() => setOpenMobile(false)}
							className="h-8 font-semibold text-base"
						>
							<IconAdjustments />
							<span>Apollo</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Streaming</SidebarGroupLabel>
					<SidebarMenu>
						{navigation.map((item) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton
									isActive={path.replace(/\/$/, "") === item.to.replace(/\/$/, "")}
									render={<Link to={item.to} />}
									tooltip={item.label}
									onClick={() => setOpenMobile(false)}
									className="min-h-10"
								>
									<item.icon />
									<span>{item.label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="h-16 shrink-0 justify-center gap-1 border-t px-4 py-0 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
				<p className="truncate font-medium text-foreground">
					{config.data?.sunshine_name || "Host Apollo"}
				</p>
				<p className="truncate">{config.data?.version || "Versão não informada"}</p>
			</SidebarFooter>
		</Sidebar>
	)
}

export function AppShell() {
	const path = useRouterState({ select: (state) => state.location.pathname })
	const title =
		navigation.find(
			(item) => item.to === path.replace(/\/$/, "") || (item.to === "/" && path === "/")
		)?.label || "Apollo"
	return (
		<HostActionsProvider>
			<SidebarProvider>
				<HostNavigation />
				<SidebarInset>
					<header
						data-slot="host-header"
						className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-sm md:px-8"
					>
						<div className="flex min-w-0 items-center gap-3">
							<SidebarTrigger />
							<Separator orientation="vertical" className="h-4" />
							<span className="truncate text-sm">{title}</span>
							<Badge variant="outline" className="hidden sm:inline-flex">
								Host local
							</Badge>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<QuickHostRestart />
							<ThemeSelect />
						</div>
					</header>
					<div className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-8">
						<HostActionNotice />
						<Outlet />
					</div>
				</SidebarInset>
			</SidebarProvider>
		</HostActionsProvider>
	)
}
