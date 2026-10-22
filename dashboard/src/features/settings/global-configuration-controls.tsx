import { useRef, useState } from "react"
import { ConfirmedAction } from "@/components/confirmed-action"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Document } from "@/lib/documents"
import { downloadFile } from "@/lib/download"
import { configuredWebAddress } from "@/lib/lifecycle"
import {
	type GlobalImport,
	globalArchive,
	globalConfigurationLimit,
	globalTemplate,
	parseGlobalConfiguration,
	savedConfiguration
} from "./global-configuration"
import { changedKeys, fields, loadSnapshot, sections } from "./model"

export function GlobalConfigurationControls({
	platform,
	currentValues,
	disabled,
	onApply
}: {
	platform: string
	currentValues: Document
	disabled: boolean
	onApply: (values: Document) => void
}) {
	const input = useRef<HTMLInputElement>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<Error | null>(null)
	const [pending, setPending] = useState<GlobalImport | null>(null)
	const [filename, setFilename] = useState("")
	const changes = pending
		? changedKeys(currentValues, { ...currentValues, ...pending.values })
		: []
	const affected = sections.filter((section) =>
		section.fields.some((field) => changes.includes(field.key))
	)
	async function exportDefaults() {
		setError(null)
		setBusy(true)
		try {
			downloadFile(
				"apollo-template-completo.zip",
				await globalArchive(globalTemplate(platform))
			)
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure
					: new Error("Não foi possível gerar o template completo.")
			)
		} finally {
			setBusy(false)
		}
	}
	async function exportSaved() {
		setError(null)
		setBusy(true)
		try {
			const snapshot = await loadSnapshot()
			downloadFile(
				"apollo-configuracoes-salvas.zip",
				await globalArchive(savedConfiguration(snapshot))
			)
		} finally {
			setBusy(false)
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Todas as configurações</CardTitle>
				<CardDescription>
					Exporte os 102 campos das 12 seções ou importe várias seções de uma vez. Padrões e
					valores salvos são arquivos diferentes; não é backup de conta, pareamentos ou
					aplicativos.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={disabled || busy}
						onClick={() => void exportDefaults()}
					>
						Baixar template completo
					</Button>
					<ConfirmedAction
						label="Exportar configurações salvas"
						disabled={disabled || busy}
						description="Lê novamente o arquivo salvo no host, sem incluir seu rascunho não salvo. O ZIP não é criptografado e pode conter nomes, endereços, caminhos e comandos privados. Não inclui conta, pareamentos, biblioteca, conteúdo de certificados/chaves ou opções desconhecidas. Guarde o arquivo localmente e revise antes de compartilhar."
						execute={exportSaved}
					/>
					<Button
						variant="outline"
						disabled={disabled || busy}
						onClick={() => input.current?.click()}
					>
						Importar configuração completa
					</Button>
					<Input
						ref={input}
						aria-label="Arquivo JSON global"
						type="file"
						accept="application/json,.json"
						className="hidden"
						disabled={disabled || busy}
						onChange={async (event) => {
							const file = event.target.files?.[0]
							event.target.value = ""
							if (!file) return
							setError(null)
							setPending(null)
							setBusy(true)
							try {
								if (file.size > globalConfigurationLimit)
									throw new Error("Use um JSON global de até 1 MiB.")
								const parsed = parseGlobalConfiguration(await file.text())
								setFilename(file.name)
								setPending(parsed)
							} catch (failure) {
								setError(
									failure instanceof Error
										? failure
										: new Error("Não foi possível importar a configuração global.")
								)
							} finally {
								setBusy(false)
							}
						}}
					/>
				</div>
				<p className="text-muted-foreground text-xs">
					Os ZIPs contêm configuracao.json e documentação. Importe apenas o JSON. Importar não
					grava nem reinicia: confirme o rascunho e use Revisar e salvar. Seções/campos
					omitidos ficam intactos.
				</p>
				{busy && (
					<p role="status" className="text-xs">
						Preparando configuração global…
					</p>
				)}
				<RequestError error={error} />
			</CardContent>
			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null)
				}}
			>
				<DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Revisar importação global</DialogTitle>
						<DialogDescription>
							{filename}: {changes.length} opções diferentes em {affected.length} seções. Nada
							será gravado no host agora. Campos ausentes, opções desconhecidas já existentes e
							outros rascunhos permanecem intactos.
						</DialogDescription>
					</DialogHeader>
					{pending?.kind === "defaults" && (
						<Alert>
							<AlertTitle>Este arquivo contém padrões</AlertTitle>
							<AlertDescription>
								Os campos presentes podem substituir sua configuração personalizada. Remova do
								JSON os campos que deseja preservar, inclusive rede, bandeja e comandos.
							</AlertDescription>
						</Alert>
					)}
					{pending && pending.platform !== "unknown" && pending.platform !== platform && (
						<Alert>
							<AlertTitle>Plataforma de origem diferente</AlertTitle>
							<AlertDescription>
								Origem: {pending.platform}. Destino: {platform || "não informado"}. Revise
								caminhos, displays e encoders antes de aplicar; campos específicos de outra
								plataforma não serão convertidos.
							</AlertDescription>
						</Alert>
					)}
					{pending && changes.includes("port") && (
						<Alert>
							<AlertTitle>Atenção à mudança de porta</AlertTitle>
							<AlertDescription>
								Depois de salvar e reiniciar, o painel estará em{" "}
								{configuredWebAddress(pending.values.port, location.origin)}. A aba atual
								poderá perder a conexão.
							</AlertDescription>
						</Alert>
					)}
					<p className="text-muted-foreground text-xs">
						Revise comandos e elevação: eles podem executar no host nos eventos configurados.
						Esta tela pode conter dados privados.
					</p>
					<section
						className="max-h-64 space-y-3 overflow-auto"
						aria-label="Diferenças da configuração global"
					>
						{affected.map((section) => (
							<section key={section.id} className="space-y-2">
								<h3 className="font-medium text-sm">{section.title}</h3>
								{changes
									.filter((key) => section.fields.some((field) => field.key === key))
									.map((key) => (
										<div key={key} className="border p-2 text-xs">
											<p className="font-medium">
												{fields.find((field) => field.key === key)?.label}{" "}
												<span className="font-mono text-muted-foreground">{key}</span>
											</p>
											<pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all">
												Antes: {JSON.stringify(currentValues[key], null, 2)}
												{"\n"}Depois: {JSON.stringify(pending?.values[key], null, 2)}
											</pre>
										</div>
									))}
							</section>
						))}
						{changes.length === 0 && <p>Não há diferenças em relação ao rascunho atual.</p>}
					</section>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPending(null)}>
							Cancelar
						</Button>
						<Button
							disabled={disabled || changes.length === 0}
							onClick={() => {
								if (pending && !disabled && changes.length) {
									onApply(pending.values)
									setPending(null)
								}
							}}
						>
							Aplicar tudo ao rascunho
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	)
}
