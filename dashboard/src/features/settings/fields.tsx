import { IconPlus, IconTrash } from "@tabler/icons-react"
import { useRef, useState } from "react"
import { CommandList } from "@/components/command-list"
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
import { Switch } from "@/components/ui/switch"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { bool, type Document, object } from "@/lib/documents"
import { type SettingField, settingOptions } from "./model"

function validMappings(value: unknown): value is Document {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false
	const groups = value as Document
	return ["mixed", "resolution_only", "refresh_rate_only"].every(
		(key) =>
			Array.isArray(groups[key]) &&
			groups[key].every((row) => row && typeof row === "object" && !Array.isArray(row))
	)
}

function MappingRecovery({
	value,
	onChange
}: {
	value: unknown
	onChange: (value: Document) => void
}) {
	const [raw, setRaw] = useState(() =>
		typeof value === "string" ? value : (JSON.stringify(value) ?? "")
	)
	return (
		<div className="space-y-3">
			<p className="text-destructive text-sm">
				As regras de display existentes são inválidas. Corrija o JSON completo com as listas
				mixed, resolution_only e refresh_rate_only. Nenhum dado foi descartado.
			</p>
			<Textarea
				aria-label="Corrigir JSON de regras de display"
				value={raw}
				onChange={(event) => {
					setRaw(event.target.value)
					try {
						const parsed: unknown = JSON.parse(event.target.value)
						if (validMappings(parsed)) onChange(parsed)
					} catch {
						/* Preserve incomplete correction separately from the original data. */
					}
				}}
			/>
		</div>
	)
}

function DisplayMappings({
	value,
	onChange
}: {
	value: unknown
	onChange: (value: Document) => void
}) {
	const identities = useRef(new WeakMap<object, string>())
	if (!validMappings(value)) return <MappingRecovery value={value} onChange={onChange} />
	const mappings = object(value)
	return (
		<div className="space-y-6">
			{["mixed", "resolution_only", "refresh_rate_only"].map((kind) => {
				const raw = mappings[kind]
				if (!Array.isArray(raw))
					return (
						<p key={kind} className="text-destructive text-sm">
							Estrutura inválida em {kind}. Corrija o arquivo antes de alterar estas regras.
						</p>
					)
				const columns = [
					...(kind !== "refresh_rate_only"
						? [{ key: "requested_resolution", label: "Resolução solicitada" }]
						: []),
					...(kind !== "resolution_only"
						? [{ key: "requested_fps", label: "FPS solicitado" }]
						: []),
					...(kind !== "refresh_rate_only"
						? [{ key: "final_resolution", label: "Resolução final" }]
						: []),
					...(kind !== "resolution_only"
						? [{ key: "final_refresh_rate", label: "Hz final" }]
						: [])
				]
				const rows = raw.map((item) => {
					const row = object(item)
					if (!identities.current.has(row)) identities.current.set(row, crypto.randomUUID())
					return { row, id: identities.current.get(row) }
				})
				return (
					<section key={kind} className="space-y-3">
						<h3 className="font-medium text-sm">
							{
								{
									mixed: "Resolução e frequência",
									resolution_only: "Somente resolução",
									refresh_rate_only: "Somente frequência"
								}[kind]
							}
						</h3>
						<Table>
							<TableHeader>
								<TableRow>
									{columns.map((column) => (
										<TableHead key={column.key}>{column.label}</TableHead>
									))}
									<TableHead>Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map(({ row, id }, index) => (
									<TableRow key={id}>
										{columns.map((column) => (
											<TableCell key={column.key}>
												<Input
													aria-label={`${column.label} ${index + 1}`}
													value={String(row[column.key] ?? "")}
													placeholder={column.key.includes("resolution") ? "1920x1080" : "120"}
													onChange={(event) =>
														onChange({
															...mappings,
															[kind]: rows.map((entry, position) => {
																if (position !== index) return entry.row
																const updated = { ...row, [column.key]: event.target.value }
																identities.current.set(updated, id ?? crypto.randomUUID())
																return updated
															})
														})
													}
												/>
											</TableCell>
										))}
										<TableCell>
											<Button
												type="button"
												size="icon"
												variant="destructive"
												aria-label={`Remover regra ${index + 1}`}
												onClick={() =>
													onChange({
														...mappings,
														[kind]: rows
															.filter((_row, position) => position !== index)
															.map((entry) => entry.row)
													})
												}
											>
												<IconTrash />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								onChange({
									...mappings,
									[kind]: [
										...raw,
										Object.fromEntries(columns.map((column) => [column.key, ""]))
									]
								})
							}
						>
							<IconPlus />
							Adicionar regra
						</Button>
					</section>
				)
			})}
		</div>
	)
}

export function SettingControl({
	field,
	value,
	onChange,
	platform
}: {
	field: SettingField
	value: unknown
	onChange: (value: unknown) => void
	platform: string
}) {
	const help = `${field.key}-help`
	let options = settingOptions(field, platform)
	const isSwitch =
		!options?.length && (field.defaultValue === "enabled" || field.defaultValue === "disabled")
	const choice = String(value ?? "") || "__auto__"
	if (options?.length && !options.some((option) => option.value === String(value ?? "")))
		options = [
			...options,
			{ value: String(value ?? ""), label: `Valor atual: ${String(value || "automático")}` }
		]
	return (
		<Field
			id={`field-${field.key}`}
			orientation={isSwitch ? "horizontal" : "vertical"}
			className="gap-3 border-b pb-6 last:border-0"
		>
			<div className="min-w-0 flex-1 space-y-2">
				<FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
				<FieldDescription id={help}>
					{field.description ||
						"Opção do host Apollo. Alterações são gravadas somente ao salvar."}
				</FieldDescription>
				<p className="font-mono text-[11px] text-muted-foreground">{field.key}</p>
			</div>
			{field.key === "dd_mode_remapping" ? (
				<DisplayMappings value={value} onChange={onChange} />
			) : ["global_prep_cmd", "global_state_cmd", "server_cmd"].includes(field.key) ? (
				<CommandList
					id={field.key}
					value={value}
					onChange={onChange}
					elevated={platform === "windows"}
					columns={
						field.key === "server_cmd"
							? [
									{ key: "name", label: "Nome" },
									{ key: "cmd", label: "Comando" }
								]
							: undefined
					}
				/>
			) : options?.length ? (
				<Select
					items={options.map((option) => ({ ...option, value: option.value || "__auto__" }))}
					value={choice}
					onValueChange={(next) => {
						if (typeof next === "string") onChange(next === "__auto__" ? "" : next)
					}}
				>
					<SelectTrigger
						id={field.key}
						aria-describedby={help}
						className="h-10 w-full sm:max-w-md"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{options.map((option) => (
							<SelectItem key={option.value} value={option.value || "__auto__"}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : isSwitch ? (
				<Switch
					id={field.key}
					checked={bool(value)}
					aria-describedby={help}
					onCheckedChange={(checked) => onChange(checked ? "enabled" : "disabled")}
				/>
			) : field.key === "keybindings" ? (
				<Textarea
					id={field.key}
					aria-describedby={help}
					value={String(value ?? "")}
					onChange={(event) => onChange(event.target.value)}
					className="font-mono"
				/>
			) : (
				<Input
					id={field.key}
					aria-describedby={help}
					value={String(value ?? "")}
					type={typeof field.defaultValue === "number" ? "number" : "text"}
					min={field.min}
					max={field.max}
					step={
						field.step ??
						(typeof field.defaultValue === "number" && !Number.isInteger(field.defaultValue)
							? "any"
							: undefined)
					}
					onChange={(event) => onChange(event.target.value)}
					className="h-10 sm:max-w-xl"
				/>
			)}
		</Field>
	)
}
