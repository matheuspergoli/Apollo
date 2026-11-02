import { useQuery } from "@tanstack/react-query"
import { RequestError } from "@/components/request-error"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select"
import { applicationsOptions } from "@/lib/documents"
import type { SettingField } from "./model"

export function WindowApplicationSelector({
	field,
	value,
	onChange
}: {
	field: SettingField
	value: unknown
	onChange: (value: unknown) => void
}) {
	const query = useQuery(applicationsOptions)
	const selected = typeof value === "string" ? value : ""
	const choices = [
		{ value: "__none__", label: "Nenhum aplicativo" },
		...(query.data?.apps ?? []).flatMap((app) =>
			typeof app.uuid === "string" && app.uuid && typeof app.name === "string"
				? [{ value: app.uuid, label: `${app.name} (${app.uuid})` }]
				: []
		)
	]
	if (selected && !choices.some((choice) => choice.value === selected))
		choices.push({ value: selected, label: `Seleção atual indisponível (${selected})` })
	return (
		<Field className="gap-3 border-b pb-6">
			<FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
			<FieldDescription id={`${field.key}-help`}>{field.description}</FieldDescription>
			<p className="font-mono text-[11px] text-muted-foreground">{field.key}</p>
			<Select
				items={choices}
				value={selected || "__none__"}
				onValueChange={(next) => {
					if (typeof next === "string") onChange(next === "__none__" ? "" : next)
				}}
				disabled={query.isPending || query.isError}
			>
				<SelectTrigger
					id={field.key}
					aria-describedby={`${field.key}-help`}
					className="h-10 w-full sm:max-w-md"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{choices.map((choice) => (
						<SelectItem key={choice.value} value={choice.value}>
							{choice.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{query.isPending && (
				<p role="status" className="text-muted-foreground text-sm">
					Carregando aplicativos…
				</p>
			)}
			<RequestError error={query.error} retry={() => void query.refetch()} />
		</Field>
	)
}
