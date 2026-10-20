import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { bool, type Document, object, text } from "@/lib/documents"

type Column = { key: string; label: string }
export function CommandList({
	value,
	onChange,
	columns = [
		{ key: "do", label: "Executar" },
		{ key: "undo", label: "Desfazer" }
	],
	elevated = true,
	id
}: {
	value: unknown
	onChange: (value: Document[]) => void
	columns?: Column[]
	elevated?: boolean
	id: string
}) {
	const identities = useRef(new WeakMap<object, string>())
	if (!Array.isArray(value))
		return (
			<div className="space-y-3">
				<p className="text-destructive text-sm">
					A estrutura existente é inválida. Corrija o JSON antes de salvar; nada foi
					descartado.
				</p>
				<Textarea
					aria-label="Corrigir JSON"
					value={typeof value === "string" ? value : JSON.stringify(value)}
					onChange={(event) => {
						try {
							const parsed: unknown = JSON.parse(event.target.value)
							if (Array.isArray(parsed)) onChange(parsed.map(object))
						} catch {
							/* Keep the existing data until valid JSON is entered. */
						}
					}}
				/>
			</div>
		)
	const rows = value.map(object)
	const keyed = rows.map((row) => {
		if (!identities.current.has(row)) identities.current.set(row, crypto.randomUUID())
		return { row, identity: identities.current.get(row) }
	})
	const change = (index: number, key: string, next: unknown) =>
		onChange(
			rows.map((row, position) => {
				if (position !== index) return row
				const updated = { ...row, [key]: next }
				identities.current.set(updated, identities.current.get(row) ?? crypto.randomUUID())
				return updated
			})
		)
	function move(index: number, direction: number) {
		const copy = [...rows]
		const destination = index + direction
		if (destination < 0 || destination >= copy.length) return
		;[copy[index], copy[destination]] = [copy[destination], copy[index]]
		onChange(copy)
	}
	return (
		<div className="space-y-3">
			{keyed.map(({ row, identity }, index) => (
				<div key={identity} className="space-y-3 border bg-muted/20 p-3">
					<div className="flex items-center justify-between gap-2">
						<span className="font-medium text-xs">Etapa {index + 1}</span>
						<div className="flex gap-1">
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Subir etapa ${index + 1}`}
								disabled={index === 0}
								onClick={() => move(index, -1)}
							>
								<IconArrowUp />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Descer etapa ${index + 1}`}
								disabled={index === rows.length - 1}
								onClick={() => move(index, 1)}
							>
								<IconArrowDown />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="destructive"
								aria-label={`Remover etapa ${index + 1}`}
								onClick={() => onChange(rows.filter((_row, position) => position !== index))}
							>
								<IconTrash />
							</Button>
						</div>
					</div>
					<div className="grid gap-3 xl:grid-cols-2">
						{columns.map((column) => (
							<div key={column.key} className="space-y-2">
								<Label htmlFor={`${id}-${index}-${column.key}`}>{column.label}</Label>
								<Input
									id={`${id}-${index}-${column.key}`}
									value={text(row[column.key])}
									onChange={(event) => change(index, column.key, event.target.value)}
									className="font-mono"
								/>
							</div>
						))}
					</div>
					{elevated && (
						<div className="flex items-center gap-2">
							<Switch
								id={`${id}-${index}-elevated`}
								checked={bool(row.elevated)}
								onCheckedChange={(checked) => change(index, "elevated", checked)}
							/>
							<Label htmlFor={`${id}-${index}-elevated`}>
								Executar com privilégios elevados
							</Label>
						</div>
					)}
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				onClick={() =>
					onChange([
						...rows,
						Object.fromEntries([
							...columns.map((column) => [column.key, ""]),
							["elevated", false]
						])
					])
				}
			>
				<IconPlus />
				Adicionar etapa
			</Button>
		</div>
	)
}
