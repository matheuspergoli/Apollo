import {
	IconApps,
	IconDeviceDesktop,
	IconDeviceGamepad,
	IconLifebuoy,
	IconRefresh
} from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import { ApiError, configOptions } from "@/lib/api"
import { applicationsOptions, clientsOptions, text } from "@/lib/documents"

export function OverviewPage() {
	const config = useQuery(configOptions)
	const clients = useQuery({ ...clientsOptions, enabled: config.isSuccess })
	const apps = useQuery({ ...applicationsOptions, enabled: config.isSuccess })
	const connected = clients.data?.clients.every(
		(client) => typeof client.connected === "boolean"
	)
		? clients.data.clients.filter((client) => client.connected === true).length
		: undefined
	const current = apps.data?.apps.find((app) => app.uuid === apps.data.current)
	const fields = [
		["Host", config.data?.sunshine_name || "Nome padrão"],
		["Captura configurada", config.data?.capture || "Automática"],
		["Display configurado", config.data?.output_name || "Seleção automática"],
		["Adaptador configurado", config.data?.adapter_name || "Seleção automática"],
		["Fallback", config.data?.fallback_mode || "Não informado"],
		["Preset NVENC", config.data?.nvenc_preset || "Padrão do Apollo"]
	]
	return (
		<>
			<section className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="mb-2 text-muted-foreground text-xs uppercase">Central do host</p>
					<h1 className="font-semibold text-3xl tracking-tight">Visão geral</h1>
					<p className="mt-3 text-muted-foreground text-sm">
						{config.data?.sunshine_name || "Apollo"} · acesso rápido ao streaming e à
						configuração.
					</p>
				</div>
				<Button
					variant="outline"
					disabled={config.isFetching || clients.isFetching || apps.isFetching}
					onClick={() => {
						void Promise.all([config.refetch(), clients.refetch(), apps.refetch()])
					}}
					className="min-h-10"
				>
					<IconRefresh />
					{config.isFetching || clients.isFetching || apps.isFetching
						? "Lendo host…"
						: "Atualizar leitura"}
				</Button>
			</section>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{[
					[
						"Aplicativos",
						apps.data ? String(apps.data.apps.length) : "—",
						"Entradas cadastradas no host"
					],
					[
						"Dispositivos",
						clients.data ? String(clients.data.clients.length) : "—",
						"Clientes vinculados"
					],
					[
						"Conectados",
						connected === undefined ? "—" : String(connected),
						"Estado informado pelo host"
					],
					[
						"Driver virtual",
						config.data?.vdisplayStatus === 0
							? "Disponível"
							: config.data?.vdisplayStatus === undefined
								? "—"
								: "Verificar",
						"Estado de inicialização, não FPS"
					]
				].map(([label, value, help]) => (
					<Card key={label}>
						<CardHeader>
							<CardDescription>{label}</CardDescription>
							<CardTitle className="font-semibold text-2xl tracking-tight">{value}</CardTitle>
						</CardHeader>
						<CardContent className="text-muted-foreground text-xs">{help}</CardContent>
					</Card>
				))}
			</div>
			<RequestError error={clients.error || apps.error} />
			{config.isPending && <p role="status">Consultando o host…</p>}
			{config.error && (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível consultar o host</AlertTitle>
					<AlertDescription>
						<p>{config.error.message}</p>
						{config.error instanceof ApiError && config.error.status === 401 && (
							<Link to="/login" className="underline">
								Entrar novamente
							</Link>
						)}
					</AlertDescription>
				</Alert>
			)}
			{config.data && !config.isError && (
				<div className="grid gap-5 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Configuração declarada</CardTitle>
							<CardDescription>
								Valores do arquivo, não estado efetivo do stream.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<dl className="space-y-4">
								{fields.map(([label, value]) => (
									<div key={label} className="grid gap-1 border-b pb-3 sm:grid-cols-2">
										<dt className="text-muted-foreground text-sm">{label}</dt>
										<dd className="wrap-anywhere text-sm">{value}</dd>
									</div>
								))}
							</dl>
							<p className="mt-5 text-muted-foreground text-xs">
								Leitura às {new Date(config.dataUpdatedAt).toLocaleTimeString("pt-BR")}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Operação e ajustes</CardTitle>
							<CardDescription>
								Abra a função certa sem procurar entre opções irrelevantes.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3">
								<Link
									to="/config"
									search={{ section: "av" }}
									className={buttonVariants({
										variant: "outline",
										className: "justify-start"
									})}
								>
									<IconDeviceDesktop />
									Display, HDR e áudio
								</Link>
								<Link
									to="/config"
									search={{ section: "nv" }}
									className={buttonVariants({
										variant: "outline",
										className: "justify-start"
									})}
								>
									<IconDeviceGamepad />
									Encoder NVIDIA NVENC
								</Link>
								<Link
									to="/pin"
									className={buttonVariants({
										variant: "outline",
										className: "justify-start"
									})}
								>
									<IconDeviceDesktop />
									Vincular e revisar dispositivos
								</Link>
								<Link
									to="/troubleshooting"
									className={buttonVariants({
										variant: "outline",
										className: "justify-start"
									})}
								>
									<IconLifebuoy />
									Logs e recuperação
								</Link>
							</div>
							<p className="mt-5 text-muted-foreground text-xs leading-6">
								Codec negociado, FPS, rede e decode devem ser conferidos no Artemis. O painel
								não transforma configuração declarada em telemetria nem mede input-to-photon.
							</p>
						</CardContent>
					</Card>
				</div>
			)}
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle>Aplicativo atual</CardTitle>
							<CardDescription>
								Estado retornado pelo processo do host, sem inferência por configuração.
							</CardDescription>
						</div>
						<Link to="/apps" className={buttonVariants({ variant: "outline" })}>
							<IconApps />
							Abrir biblioteca
						</Link>
					</div>
				</CardHeader>
				<CardContent>
					<p className="font-medium">
						{apps.data
							? current
								? text(current.name)
								: apps.data.current
									? "Aplicativo não identificado na biblioteca"
									: "Nenhum aplicativo em execução"
							: "Estado ainda não disponível"}
					</p>
					<p className="mt-2 text-muted-foreground text-sm">
						Inicie ou encerre aplicativos pela biblioteca. Ações que interrompem a sessão
						exigem confirmação.
					</p>
				</CardContent>
			</Card>
		</>
	)
}
