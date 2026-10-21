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
			<SidebarHeader className="border-b p-4">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							render={<Link to="/" />}
							className="h-10 font-semibold text-base"
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
				<SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Referência do projeto</SidebarGroupLabel>
					<div className="space-y-2 px-2 text-muted-foreground text-xs">
						<p>RTX 4060 → Galaxy S25+</p>
						<p>1080p120 · AV1 / HDR</p>
						<p className="leading-5">Alvo de teste, não medição da sessão atual.</p>
					</div>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="border-t p-4 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
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
		<SidebarProvider>
			<HostNavigation />
			<SidebarInset>
				<header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-sm md:px-8">
					<div className="flex min-w-0 items-center gap-3">
						<SidebarTrigger />
						<Separator orientation="vertical" className="h-4" />
						<span className="truncate text-sm">{title}</span>
						<Badge variant="outline" className="hidden sm:inline-flex">
							Host local
						</Badge>
					</div>
					<ThemeSelect />
				</header>
				<div className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-8">
					<Outlet />
				</div>
				<footer className="flex flex-wrap gap-4 border-t px-8 py-4 text-muted-foreground text-xs">
					<span>Apollo · instalação de teste</span>
					<a
						href="https://github.com/matheuspergoli/Apollo"
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4"
					>
						Código e proveniência
					</a>
					<a
						href="https://github.com/ClassicOldSong/Apollo/blob/master/LICENSE"
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4"
					>
						Licença
					</a>
				</footer>
			</SidebarInset>
		</SidebarProvider>
	)
}
