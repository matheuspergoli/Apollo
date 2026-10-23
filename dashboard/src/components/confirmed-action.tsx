import { useMutation } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useState } from "react"
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { RequestError } from "./request-error"

export function ConfirmedAction({
	label,
	description,
	execute,
	destructive = false,
	disabled = false,
	icon,
	compact = false,
	triggerTitle,
	triggerVariant
}: {
	label: string
	description: string
	execute: () => Promise<unknown>
	destructive?: boolean
	disabled?: boolean
	icon?: ReactNode
	compact?: boolean
	triggerTitle?: string
	triggerVariant?: "outline" | "destructive"
}) {
	const [open, setOpen] = useState(false)
	const mutation = useMutation({
		mutationFn: execute,
		gcTime: 0,
		retry: false,
		onSuccess: () => setOpen(false)
	})
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!mutation.isPending) {
					setOpen(next)
					mutation.reset()
				}
			}}
		>
			<AlertDialogTrigger
				render={
					<Button
						variant={triggerVariant || (destructive ? "destructive" : "outline")}
						disabled={disabled}
						size={compact ? "icon" : "default"}
						aria-label={compact ? label : undefined}
						title={triggerTitle || label}
					/>
				}
			>
				{icon}
				{compact ? <span className="sr-only">{label}</span> : label}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{label}?</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<RequestError error={mutation.error} />
				<AlertDialogFooter>
					<Button
						variant="outline"
						disabled={mutation.isPending}
						onClick={() => setOpen(false)}
					>
						Cancelar
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						disabled={mutation.isPending}
						onClick={() => mutation.mutate()}
					>
						{mutation.isPending ? "Executando…" : "Confirmar"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
