import { useRef, useState } from "react"
import { ConfirmedAction } from "@/components/confirmed-action"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { sectionSavedValues } from "./global-configuration"
import { loadSnapshot, type SettingSection } from "./model"
import { parseSectionTemplate, sectionArchive, templateLimit } from "./templates"

export function SectionTemplates({
	section,
	currentValues,
	disabled,
	onApply
}: {
	section: SettingSection
	currentValues: Document
	disabled: boolean
	onApply: (values: Document) => void
}) {
	const input = useRef<HTMLInputElement>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<Error | null>(null)
	const [pending, setPending] = useState<Document | null>(null)
	const [filename, setFilename] = useState("")
	async function exportTemplate() {
		setError(null)
		setBusy(true)
		try {
			downloadFile(`apollo-${section.id}-template.zip`, await sectionArchive(section))
		} catch (failure) {
			setError(
				failure instanceof Error ? failure : new Error("Não foi possível gerar o template.")
			)
		} finally {
			setBusy(false)
		}
	}
	async function exportSaved() {
		setError(null)
		setBusy(true)
		try {
			downloadFile(
				`apollo-${section.id}-configuracoes-salvas.zip`,
				await sectionArchive(section, sectionSavedValues(section, await loadSnapshot()))
			)
		} finally {
			setBusy(false)
		}
	}
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={disabled || busy}
					onClick={() => void exportTemplate()}
				>
					Baixar template da seção
				</Button>
				<ConfirmedAction
					label="Exportar configurações salvas da seção"
					disabled={disabled || busy}
					description="Lê novamente os valores salvos desta seção, não o rascunho. O ZIP não é criptografado e pode conter nomes, comandos e caminhos privados. Revise antes de compartilhar. Não inclui outras seções, conta, pareamentos ou conteúdo de certificados."
					execute={exportSaved}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={disabled || busy}
					onClick={() => input.current?.click()}
				>
					Importar JSON da seção
				</Button>
				<Input
					ref={input}
					type="file"
					accept="application/json,.json"
					aria-label="Arquivo JSON da seção"
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
							if (file.size > templateLimit) throw new Error("Use um JSON de até 256 KiB.")
							const values = parseSectionTemplate(await file.text(), section)
							setFilename(file.name)
							setPending(values)
						} catch (failure) {
							setError(
								failure instanceof Error
									? failure
									: new Error("Não foi possível importar o JSON.")
							)
						} finally {
							setBusy(false)
						}
					}}
				/>
			</div>
			<p className="text-muted-foreground text-xs">
				{section.title}: template usa padrões; exportar valores salvos consulta o host sem
				incluir o rascunho. Importar altera só esta seção no rascunho; revise e salve depois.
			</p>
			{busy && (
				<p role="status" className="text-xs">
					Preparando arquivo…
				</p>
			)}
			<RequestError error={error} />
			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null)
				}}
			>
				<DialogContent className="max-h-[85dvh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Importar em {section.title}?</DialogTitle>
						<DialogDescription>
							{filename}: {Object.keys(pending || {}).length} opções serão aplicadas ao
							rascunho. Os campos ausentes e as outras seções permanecem intactos. Nenhum
							arquivo do host será gravado agora.
						</DialogDescription>
					</DialogHeader>
					<Alert>
						<AlertTitle>Valores presentes substituem o rascunho</AlertTitle>
						<AlertDescription>
							Templates usam padrões; exportações usam os valores salvos. Em ambos, remova do
							JSON os campos que não quer alterar, inclusive porta e descoberta de rede.
						</AlertDescription>
					</Alert>
					{pending &&
						Object.hasOwn(pending, "port") &&
						String(pending.port) !== String(currentValues.port) && (
							<Alert>
								<AlertTitle>Atenção à mudança de porta</AlertTitle>
								<AlertDescription>
									Porta base: {String(currentValues.port)} → {String(pending.port)}. Depois de
									salvar e reiniciar, o painel estará em{" "}
									{configuredWebAddress(pending.port, location.origin)}.
								</AlertDescription>
							</Alert>
						)}
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all border bg-muted/30 p-3 text-xs">
						{JSON.stringify(pending, null, 2)}
					</pre>
					<DialogFooter>
						<Button variant="outline" onClick={() => setPending(null)}>
							Cancelar
						</Button>
						<Button
							disabled={disabled}
							onClick={() => {
								if (pending && !disabled) {
									onApply(pending)
									setPending(null)
								}
							}}
						>
							Aplicar ao rascunho
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
