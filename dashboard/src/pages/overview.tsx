import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ThemeSelect } from "@/components/theme-provider"
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
import { isPackagedPreview } from "@/lib/runtime"

export function OverviewPage() {
	const config = useQuery(configOptions)
	const fields = [
		["Host", config.data?.sunshine_name || "Nome padrão"],
		["Captura configurada", config.data?.capture || "Automática"],
		["Display configurado", config.data?.output_name || "Seleção automática"],
		["Adaptador configurado", config.data?.adapter_name || "Seleção automática"],
		["Fallback", config.data?.fallback_mode || "Não informado"],
		["Preset NVENC", config.data?.nvenc_preset || "Padrão do Apollo"]
	]
	return (
		<main className="mx-auto max-w-6xl space-y-8 px-5 py-8 md:px-10">
			<header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
				<span className="font-semibold">Apollo</span>
				<ThemeSelect />
			</header>
			<section className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="mb-2 text-muted-foreground text-xs uppercase">
						Visão geral · migração React
					</p>
					<h1 className="font-semibold text-3xl tracking-tight">Seu host, sem adivinhação.</h1>
					<p className="mt-3 text-muted-foreground text-sm">
						Alvo: RTX 4060 → S25+ · 1080p120. Não é uma detecção da sessão atual.
					</p>
				</div>
				<Button
					variant="outline"
					disabled={config.isFetching}
					onClick={() => void config.refetch()}
					className="min-h-10"
				>
					{config.isFetching ? "Lendo host…" : "Atualizar leitura"}
				</Button>
			</section>
			{isPackagedPreview() && (
				<nav aria-label="Painel completo" className="flex flex-wrap gap-3">
					{[
						["/", "Painel completo"],
						["/pin", "Dispositivos"],
						["/apps", "Aplicativos"],
						["/config", "Configurações"],
						["/troubleshooting", "Diagnóstico"]
					].map(([href, label]) => (
						<a key={href} href={href} className={buttonVariants({ variant: "outline" })}>
							{label} · compatibilidade
						</a>
					))}
				</nav>
			)}
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
							<CardTitle>Medições ainda indisponíveis</CardTitle>
							<CardDescription>Não representamos ausência de dados como zero.</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="space-y-4 text-muted-foreground text-sm">
								<li>Codec, HDR e FPS negociados</li>
								<li>Captura, encode e filas</li>
								<li>Decode e apresentação no S25+</li>
								<li>Perdas, jitter e rota Tailscale</li>
							</ul>
						</CardContent>
					</Card>
				</div>
			)}
			<Alert role="note">
				<AlertTitle>Migração em andamento</AlertTitle>
				<AlertDescription>
					Esta é a nova base React. Configurações, dispositivos, aplicativos e diagnóstico
					ainda precisam de migração e testes de paridade antes de substituir o painel em uso.
					Sem driver novo ou PyroWave nesta interface.
				</AlertDescription>
			</Alert>
		</main>
	)
}
