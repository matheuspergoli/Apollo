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
import { comparable } from "@/features/settings/model"
import type { Document } from "@/lib/documents"
import { downloadFile } from "@/lib/download"
import {
	type ApplicationFile,
	applicationArchive,
	applicationFileLimit,
	applicationTemplate,
	exportedApplication,
	parseApplicationFile
} from "./configuration"

export function ApplicationConfigurationControls({
	current,
	disabled,
	onApply
}: {
	current: Document
	disabled: boolean
	onApply: (values: Document) => void
}) {
	const input = useRef<HTMLInputElement>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<Error | null>(null)
	const [pending, setPending] = useState<ApplicationFile | null>(null)
	const [filename, setFilename] = useState("")
	const changes = Object.keys(pending?.application || {}).filter((key) => {
		const normalized = (value: unknown) =>
			["exit-timeout", "scale-factor"].includes(key) &&
			value !== "" &&
			Number.isFinite(Number(value))
				? Number(value)
				: value
		return (
			comparable(normalized(current[key])) !==
			comparable(normalized(pending?.application[key as keyof ApplicationFile["application"]]))
		)
	})
	async function template() {
		setBusy(true)
		setError(null)
		try {
			downloadFile(
				"apollo-aplicativo-template.zip",
				await applicationArchive(applicationTemplate())
			)
		} catch (failure) {
			setError(
				failure instanceof Error ? failure : new Error("Não foi possível gerar o template.")
			)
		} finally {
			setBusy(false)
		}
	}
	async function exportCurrent() {
		setBusy(true)
		setError(null)
		try {
			downloadFile(
				"apollo-aplicativo.zip",
				await applicationArchive(exportedApplication(current))
			)
		} finally {
			setBusy(false)
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Arquivo de configuração do aplicativo</CardTitle>
				<CardDescription>
					Um aplicativo por arquivo. Funciona ao criar ou editar; não importa a biblioteca
					inteira nem copia UUIDs.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={disabled || busy}
						onClick={() => void template()}
					>
						Baixar template de aplicativo
					</Button>
					<ConfirmedAction
						label="Exportar aplicativo do editor"
						disabled={disabled || busy}
						description="Exporta o rascunho deste editor, inclusive alterações ainda não salvas. O ZIP não é criptografado e pode conter comandos e caminhos privados. Não inclui UUID, estado de execução, dados do host ou campos desconhecidos. Não transfere a capa ou o executável e não salva a biblioteca."
						execute={exportCurrent}
					/>
					<Button
						type="button"
						variant="outline"
						disabled={disabled || busy}
						onClick={() => input.current?.click()}
					>
						Importar JSON de aplicativo
					</Button>
					<Input
						ref={input}
						type="file"
						accept="application/json,.json"
						aria-label="Arquivo JSON do aplicativo"
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
								if (file.size > applicationFileLimit)
									throw new Error("Use um JSON de aplicativo de até 512 KiB.")
								setPending(parseApplicationFile(await file.text(), current))
								setFilename(file.name)
							} catch (failure) {
								setError(
									failure instanceof Error
										? failure
										: new Error("Não foi possível importar o aplicativo.")
								)
							} finally {
								setBusy(false)
							}
						}}
					/>
				</div>
				<p className="text-muted-foreground text-xs">
					O ZIP inclui aplicativo.json, documentação e schema.json. Importe apenas o JSON.
					Campos ausentes mantêm o rascunho; a biblioteca só muda em Salvar aplicativo.
				</p>
				{busy && (
					<p role="status" className="text-xs">
						Preparando arquivo de aplicativo…
					</p>
				)}
				<RequestError error={pending ? null : error} />
			</CardContent>
			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null)
				}}
			>
				<DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Revisar importação de aplicativo</DialogTitle>
						<DialogDescription>
							{filename}: {changes.length} opções diferentes. Nenhum comando será executado ou
							arquivo gravado agora. A identidade do aplicativo editado permanece intacta; ao
							criar, o host gera uma identidade nova somente ao salvar.
						</DialogDescription>
					</DialogHeader>
					<Alert>
						<AlertTitle>Revise comandos, caminhos e elevação</AlertTitle>
						<AlertDescription>
							Campos presentes substituem o valor inteiro, inclusive listas vazias. Caminhos
							são do host e arquivos não são transferidos. Comandos podem executar no
							computador nos eventos configurados após salvar.
						</AlertDescription>
					</Alert>
					<RequestError error={error} />
					<section
						aria-label="Diferenças do aplicativo"
						className="max-h-64 space-y-3 overflow-auto"
					>
						{changes.map((key) => (
							<div key={key} className="border p-2 text-xs">
								<p className="font-mono">{key}</p>
								<pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all">
									Antes: {JSON.stringify(current[key], null, 2)}
									{"\n"}Depois:{" "}
									{JSON.stringify(
										pending?.application[key as keyof ApplicationFile["application"]],
										null,
										2
									)}
								</pre>
							</div>
						))}
						{!changes.length && <p>Não há diferenças em relação ao rascunho atual.</p>}
					</section>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setPending(null)
								setError(null)
							}}
						>
							Cancelar
						</Button>
						<Button
							disabled={disabled || !changes.length}
							onClick={() => {
								if (pending && !disabled && changes.length) {
									try {
										const validated = parseApplicationFile(JSON.stringify(pending), current)
										onApply(validated.application)
										setPending(null)
										setError(null)
									} catch (failure) {
										setError(
											failure instanceof Error
												? failure
												: new Error("Não foi possível aplicar o arquivo.")
										)
									}
								}
							}}
						>
							Aplicar ao rascunho
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	)
}
