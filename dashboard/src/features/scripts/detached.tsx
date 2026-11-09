import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type Document, text } from "@/lib/documents"
import { ScriptCommand } from "./command"

function InvalidDetached({
	value,
	onChange
}: {
	value: unknown
	onChange: (value: unknown[]) => void
}) {
	const [raw, setRaw] = useState(() => JSON.stringify(value, null, 2) ?? "")
	return (
		<div className="space-y-2">
			<p role="alert" className="text-destructive text-sm">
				A lista existente é inválida. Corrija o JSON; nenhum comando foi descartado.
			</p>
			<Textarea
				aria-label="Corrigir comandos desanexados"
				value={raw}
				onChange={(event) => {
					setRaw(event.target.value)
					try {
						const parsed: unknown = JSON.parse(event.target.value)
						if (Array.isArray(parsed)) onChange(parsed)
					} catch {
						/* Keep incomplete edits local. */
					}
				}}
			/>
		</div>
	)
}

export function DetachedCommands({
	value,
	onChange,
	disabled
}: {
	value: unknown
	onChange: (value: unknown[]) => void
	disabled: boolean
}) {
	// IDs belong to editor rows, not command text: duplicate commands and edits
	// retain focus; removing/reordering rows moves the identity with the value.
	const [ids, setIds] = useState(() => Array.from({ length: 256 }, () => crypto.randomUUID()))
	if (
		!Array.isArray(value) ||
		value.length > 256 ||
		value.some(
			(row) =>
				typeof row !== "string" && (!row || typeof row !== "object" || Array.isArray(row))
		)
	)
		return <InvalidDetached value={value} onChange={onChange} />
	const rows = value as (string | Document)[]
	function move(index: number, direction: number) {
		const destination = index + direction
		const next = [...rows]
		;[next[index], next[destination]] = [next[destination], next[index]]
		setIds((previous) => {
			const next = [...previous]
			;[next[index], next[destination]] = [next[destination], next[index]]
			return next
		})
		onChange(next)
	}
	return (
		<div className="min-w-0 space-y-3">
			{rows.map((row, index) => (
				<fieldset
					key={ids[index]}
					aria-label={`Comando desanexado ${index + 1}`}
					className="min-w-0 space-y-3 border bg-muted/20 p-3"
				>
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor={`app-detached-${index}`}>Comando {index + 1}</Label>
						<div className="flex gap-1">
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Subir comando desanexado ${index + 1}`}
								disabled={disabled || index === 0}
								onClick={() => move(index, -1)}
							>
								<IconArrowUp />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Descer comando desanexado ${index + 1}`}
								disabled={disabled || index === rows.length - 1}
								onClick={() => move(index, 1)}
							>
								<IconArrowDown />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="destructive"
								aria-label={`Remover comando desanexado ${index + 1}`}
								disabled={disabled}
								onClick={() => {
									setIds((previous) => [
										...previous.filter((_, position) => position !== index),
										crypto.randomUUID()
									])
									onChange(rows.filter((_, position) => position !== index))
								}}
							>
								<IconTrash />
							</Button>
						</div>
					</div>
					<ScriptCommand
						id={`app-detached-${index}`}
						label={`comando desanexado ${index + 1}`}
						multiline
						disabled={disabled}
						value={typeof row === "string" ? row : text(row.cmd)}
						reference={typeof row === "string" ? undefined : row["cmd-script"]}
						onChange={(command, reference) =>
							onChange(
								rows.map((item, position) =>
									position !== index
										? item
										: reference
											? { cmd: "", "cmd-script": reference }
											: command
								)
							)
						}
					/>
				</fieldset>
			))}
			<Button
				type="button"
				variant="outline"
				disabled={disabled || rows.length >= 256}
				onClick={() => onChange([...rows, ""])}
			>
				<IconPlus />
				Adicionar comando
			</Button>
		</div>
	)
}
