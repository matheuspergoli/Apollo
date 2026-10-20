import { useMutation } from "@tanstack/react-query"
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
	disabled = false
}: {
	label: string
	description: string
	execute: () => Promise<unknown>
	destructive?: boolean
	disabled?: boolean
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
					<Button variant={destructive ? "destructive" : "outline"} disabled={disabled} />
				}
			>
				{label}
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
