import { useBlocker } from "@tanstack/react-router"
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export function UnsavedChanges({
	dirty,
	pending = false
}: {
	dirty: boolean
	pending?: boolean
}) {
	const blocker = useBlocker({
		shouldBlockFn: ({ current, next }) =>
			(dirty || pending) && current.routeId !== next.routeId,
		enableBeforeUnload: dirty || pending,
		withResolver: true
	})
	return (
		<AlertDialog
			open={blocker.status === "blocked"}
			onOpenChange={(open) => {
				if (!open) blocker.reset?.()
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Descartar alterações não salvas?</AlertDialogTitle>
					<AlertDialogDescription>
						{pending
							? "Há uma operação em andamento. Aguarde: sair da página não cancela uma solicitação já enviada ao host."
							: "Seu rascunho existe apenas nesta página. Sair não grava alterações no host."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="outline" onClick={() => blocker.reset?.()}>
						Continuar editando
					</Button>
					<Button variant="destructive" disabled={pending} onClick={() => blocker.proceed?.()}>
						Descartar e sair
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
