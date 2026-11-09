import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScriptsDialog } from "./dialog"
import { type ScriptReference, scriptName, scriptReferenceSchema } from "./model"

export function ScriptCommand({
	id,
	label,
	value,
	reference,
	onChange,
	disabled = false,
	multiline = false
}: {
	id: string
	label: string
	value: string
	reference: unknown
	onChange: (value: string, reference?: ScriptReference) => void
	disabled?: boolean
	multiline?: boolean
}) {
	const [open, setOpen] = useState(false)
	const manual = useRef(value)
	const parsed = reference === undefined ? null : scriptReferenceSchema.safeParse(reference)
	const script = parsed?.success ? parsed.data : null
	const ManualInput = multiline ? Textarea : Input
	const [argumentIds, setArgumentIds] = useState(() =>
		Array.from({ length: 16 }, () => crypto.randomUUID())
	)
	return (
		<div className="min-w-0 space-y-3">
			{reference === undefined ? (
				<div className="flex flex-wrap gap-2">
					<ManualInput
						id={id}
						className="min-w-0 flex-1 font-mono"
						autoComplete="off"
						spellCheck={false}
						value={value}
						disabled={disabled}
						onChange={(event) => {
							manual.current = event.target.value
							onChange(event.target.value)
						}}
					/>
					<Button
						type="button"
						variant="outline"
						disabled={disabled}
						onClick={() => {
							manual.current = value
							setOpen(true)
						}}
					>
						Usar script
					</Button>
				</div>
			) : (
				<>
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<Button
							id={id}
							type="button"
							variant="outline"
							className="h-auto min-h-8 min-w-0 max-w-full whitespace-normal break-all text-left"
							disabled={disabled}
							onClick={() => setOpen(true)}
						>
							{script
								? `${scriptName(script)}${"number" in script && script.number ? ` · versão ${script.number}` : ""}`
								: "Revisar script indisponível"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							disabled={disabled}
							onClick={() => onChange(manual.current)}
						>
							Usar comando manual
						</Button>
					</div>
					{!script && (
						<p role="alert" className="text-destructive text-xs">
							A referência existente é inválida. Escolha um script ou volte ao comando manual.
						</p>
					)}
					{script && (
						<div className="space-y-2">
							{(script.arguments || []).map((argument, index) => (
								<div key={argumentIds[index]} className="flex gap-2">
									<Input
										aria-label={`Argumento ${index + 1} de ${label}`}
										autoComplete="off"
										spellCheck={false}
										value={argument}
										disabled={disabled}
										onChange={(event) =>
											onChange("", {
												...script,
												arguments: (script.arguments || []).map((item, position) =>
													position === index ? event.target.value : item
												)
											})
										}
									/>
									<Button
										type="button"
										variant="ghost"
										disabled={disabled}
										aria-label={`Remover argumento ${index + 1} de ${label}`}
										onClick={() => {
											setArgumentIds((ids) => [
												...ids.filter((_, position) => position !== index),
												crypto.randomUUID()
											])
											onChange("", {
												...script,
												arguments: script.arguments?.filter(
													(_, position) => position !== index
												)
											})
										}}
									>
										Remover
									</Button>
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={disabled || (script.arguments?.length || 0) >= 16}
								onClick={() =>
									onChange("", { ...script, arguments: [...(script.arguments || []), ""] })
								}
							>
								Adicionar argumento
							</Button>
						</div>
					)}
				</>
			)}
			{open && (
				<ScriptsDialog
					onClose={() => setOpen(false)}
					onSelect={(selected) => onChange("", selected)}
				/>
			)}
		</div>
	)
}
