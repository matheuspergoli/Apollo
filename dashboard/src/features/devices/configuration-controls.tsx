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
	type DeviceFile,
	deviceArchive,
	deviceFileLimit,
	deviceTemplate,
	exportedDevice,
	parseDeviceFile
} from "./configuration"
import { permissions } from "./model"

function permissionLabels(value: unknown) {
	const mask = Number(value)
	return (
		permissions
			.filter(
				(permission) =>
					Boolean(mask & permission.bit) ||
					Boolean(permission.suppressedBy && mask & permission.suppressedBy)
			)
			.map((permission) => permission.label)
			.join(", ") || "Nenhuma permissão"
	)
}

export function DeviceConfigurationControls({
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
	const [pending, setPending] = useState<DeviceFile | null>(null)
	const changes = Object.keys(pending?.settings || {}).filter(
		(key) =>
			comparable(current[key]) !==
			comparable(pending?.settings[key as keyof DeviceFile["settings"]])
	)
	async function template() {
		setError(null)
		setBusy(true)
		try {
			downloadFile("apollo-permissoes-template.zip", await deviceArchive(deviceTemplate()))
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
		try {
			downloadFile("apollo-permissoes.zip", await deviceArchive(exportedDevice(current)))
		} finally {
			setBusy(false)
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Arquivo de permissões</CardTitle>
				<CardDescription>
					Configuração de um dispositivo já pareado, sem transferir nome, UUID ou certificados.
					Não modifica o fluxo de pareamento.
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
						Baixar template de permissões
					</Button>
					<ConfirmedAction
						label="Exportar permissões do editor"
						disabled={disabled || busy}
						description="Exporta os valores conhecidos do rascunho, inclusive alterações ainda não salvas, sem nome/UUID/certificados. O ZIP não é criptografado e pode conter comandos e caminhos privados; revise antes de compartilhar. Não salva o dispositivo."
						execute={exportCurrent}
					/>
					<Button
						type="button"
						variant="outline"
						disabled={disabled || busy}
						onClick={() => input.current?.click()}
					>
						Importar JSON de permissões
					</Button>
					<Input
						ref={input}
						type="file"
						accept="application/json,.json"
						aria-label="Arquivo JSON de permissões"
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
								if (file.size > deviceFileLimit) throw new Error("Use um JSON de até 256 KiB.")
								setPending(parseDeviceFile(await file.text(), current))
							} catch (failure) {
								setError(
									failure instanceof Error
										? failure
										: new Error("Não foi possível importar as permissões.")
								)
							} finally {
								setBusy(false)
							}
						}}
					/>
				</div>
				<p className="text-muted-foreground text-xs">
					ZIP com dispositivo.json, guia e schema.json. Importe apenas o JSON; somente Salvar
					dispositivo grava no host. Campos ausentes permanecem intactos.
				</p>
				{busy && <p role="status">Preparando arquivo…</p>}
				<RequestError error={pending ? null : error} />
			</CardContent>
			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPending(null)
						setError(null)
					}
				}}
			>
				<DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Revisar importação de permissões</DialogTitle>
						<DialogDescription>
							{changes.length} opções diferentes. A identidade, o nome e o pareamento
							permanecem intactos. Nada é gravado ou executado agora.
						</DialogDescription>
					</DialogHeader>
					<Alert>
						<AlertTitle>Revise os privilégios deste dispositivo</AlertTitle>
						<AlertDescription>
							O template é conservador e pode revogar permissões atuais. Comandos e elevação
							podem executar ações no host nos eventos configurados após salvar. Importe apenas
							arquivos confiáveis.
						</AlertDescription>
					</Alert>
					<RequestError error={error} />
					<section
						aria-label="Diferenças de permissões"
						className="max-h-64 space-y-3 overflow-auto"
					>
						{changes.map((key) => (
							<div key={key} className="border p-2 text-xs">
								<p className="font-mono">{key}</p>
								{key === "perm" && (
									<p className="my-2">
										Antes: {permissionLabels(current.perm)}. Depois:{" "}
										{permissionLabels(pending?.settings.perm)}.
									</p>
								)}
								<pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all">
									Antes: {JSON.stringify(current[key], null, 2)}
									{"\n"}Depois:{" "}
									{JSON.stringify(
										pending?.settings[key as keyof DeviceFile["settings"]],
										null,
										2
									)}
								</pre>
							</div>
						))}
						{!changes.length && <p>Não há diferenças no rascunho.</p>}
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
								if (pending && !disabled && changes.length)
									try {
										const parsed = parseDeviceFile(JSON.stringify(pending), current)
										onApply(parsed.settings)
										setPending(null)
										setError(null)
									} catch (failure) {
										setError(
											failure instanceof Error
												? failure
												: new Error("Não foi possível aplicar as permissões.")
										)
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
