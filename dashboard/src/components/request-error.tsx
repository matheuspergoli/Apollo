import { IconAlertTriangle } from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

export function RequestError({ error, retry }: { error: Error | null; retry?: () => void }) {
	if (!error) return null
	return (
		<Alert variant="destructive">
			<IconAlertTriangle />
			<AlertTitle>Não foi possível concluir</AlertTitle>
			<AlertDescription>
				<p>{error.message}</p>
				{error instanceof ApiError && error.status === 401 && (
					<p>
						<a href="/login" target="_blank" rel="noreferrer">
							Entrar em outra aba
						</a>{" "}
						para renovar a sessão sem perder o rascunho desta página.
					</p>
				)}
				{retry && (
					<Button variant="outline" size="sm" onClick={retry}>
						Tentar novamente
					</Button>
				)}
			</AlertDescription>
		</Alert>
	)
}
