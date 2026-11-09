import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"
import { type CommandDraft, type Resource, revisionFor, type Slot, slotNames } from "./model"

const sourceOptions = [
	{ value: "manual", label: "Comando manual" },
	{ value: "script", label: "Script do Apollo" }
]

export function CommandEditor({
	slot,
	command,
	resources,
	onChange,
	onInspect,
	onFile
}: {
	slot: Slot
	command: CommandDraft
	resources: Resource[]
	onChange: (command: CommandDraft) => void
	onInspect: (resourceId: string, revision: number) => void
	onFile: (slot: Slot) => void
}) {
	const resource = resources.find((item) => item.id === command.resourceId)
	const revision = revisionFor(resources, command)
	const choices = [
		{ value: "__none__", label: "Selecione um script" },
		...resources.map((item) => ({ value: item.id, label: item.name }))
	]
	const label = slotNames[slot].toLocaleLowerCase("pt-BR")
	return (
		<section aria-label={slotNames[slot]} className="min-w-0 space-y-4 border bg-muted/20 p-3">
			<h3 className="font-medium">{slotNames[slot]}</h3>
			<Field>
				<FieldLabel htmlFor={`${slot}-source`}>Origem de {label}</FieldLabel>
				<Select
					items={sourceOptions}
					value={command.source}
					onValueChange={(value) => {
						if (value === "manual" || value === "script")
							onChange({ ...command, source: value })
					}}
				>
					<SelectTrigger id={`${slot}-source`} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{sourceOptions.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			{command.source === "manual" ? (
				<Field>
					<FieldLabel htmlFor={`${slot}-manual`}>Comando de {label}</FieldLabel>
					<Input
						id={`${slot}-manual`}
						spellCheck={false}
						autoComplete="off"
						value={command.manual}
						onChange={(event) => onChange({ ...command, manual: event.target.value })}
						className="font-mono"
					/>
					<FieldDescription>
						{slot === "launch"
							? "Vazio representa o desktop. Nenhum comando é executado na simulação."
							: "O comando manual permanece no rascunho ao alternar a origem."}
					</FieldDescription>
				</Field>
			) : (
				<>
					<Field>
						<FieldLabel htmlFor={`${slot}-script`}>Script de {label}</FieldLabel>
						<Select
							items={choices}
							value={command.resourceId || "__none__"}
							onValueChange={(value) => {
								const selected = resources.find((item) => item.id === value)
								onChange({
									...command,
									resourceId: selected?.id || "",
									revision: selected?.revisions.at(-1)?.number || 0
								})
							}}
						>
							<SelectTrigger id={`${slot}-script`} className="w-full min-w-0">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{choices.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					{resource && (
						<Field>
							<FieldLabel htmlFor={`${slot}-revision`}>Revisão de {label}</FieldLabel>
							<Select
								items={resource.revisions.map((item) => ({
									value: String(item.number),
									label: `Revisão ${item.number}${item.available ? "" : " — indisponível"}`
								}))}
								value={String(command.revision)}
								onValueChange={(value) => onChange({ ...command, revision: Number(value) })}
							>
								<SelectTrigger id={`${slot}-revision`} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{resource.revisions.map((item) => (
										<SelectItem key={item.number} value={String(item.number)}>
											Revisão {item.number}
											{item.available ? "" : " — indisponível"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								A revisão fica fixa neste vínculo. Adicionar outra revisão não troca o script
								do aplicativo.
							</FieldDescription>
						</Field>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							disabled={!revision?.available}
							onClick={() => onInspect(command.resourceId, command.revision)}
						>
							Ver conteúdo de {label}
						</Button>
						<Button variant="outline" onClick={() => onFile(slot)}>
							Adicionar arquivo à {label}
						</Button>
					</div>
					<Field>
						<FieldLabel htmlFor={`${slot}-args`}>Argumentos de {label}</FieldLabel>
						<Input
							id={`${slot}-args`}
							autoComplete="off"
							spellCheck={false}
							value={command.args[0] || ""}
							onChange={(event) =>
								onChange({ ...command, args: event.target.value ? [event.target.value] : [] })
							}
						/>
						<FieldDescription>
							Nesta amostra, o texto inteiro representa um argumento literal. Não é código
							PowerShell nem uma linha de shell.
						</FieldDescription>
					</Field>
				</>
			)}
		</section>
	)
}
