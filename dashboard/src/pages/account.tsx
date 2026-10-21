import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { UnsavedChanges } from "@/components/unsaved-changes"
import { action } from "@/lib/documents"

const empty = {
	currentUsername: "",
	currentPassword: "",
	newUsername: "",
	newPassword: "",
	confirmNewPassword: ""
}
export function AccountPage() {
	const [fields, setFields] = useState(empty)
	const [visible, setVisible] = useState(false)
	const [error, setError] = useState("")
	const client = useQueryClient()
	const mutation = useMutation({
		mutationKey: ["account", "password-change"],
		mutationFn: () => action("password", fields),
		gcTime: 0,
		onSuccess: () => {
			setFields(empty)
			client.removeQueries()
		}
	})
	const labels = {
		currentUsername: "Usuário atual",
		currentPassword: "Senha atual",
		newUsername: "Novo usuário (opcional)",
		newPassword: "Nova senha",
		confirmNewPassword: "Confirmar nova senha"
	}
	return (
		<>
			<UnsavedChanges
				dirty={Object.values(fields).some(Boolean) && !mutation.isSuccess}
				pending={mutation.isPending}
			/>
			<div>
				<p className="text-muted-foreground text-xs uppercase tracking-widest">
					Segurança do painel
				</p>
				<h1 className="mt-2 font-semibold text-3xl tracking-tight">Acesso e senha</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Alterar o acesso ao painel não remove os dispositivos pareados.
				</p>
			</div>
			<Card className="max-w-3xl">
				<CardHeader>
					<CardTitle>Atualizar credenciais</CardTitle>
					<CardDescription>
						É necessário conhecer o acesso atual. A sessão será invalidada após a alteração.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="space-y-6"
						onSubmit={(event) => {
							event.preventDefault()
							setError("")
							if (fields.newPassword !== fields.confirmNewPassword) {
								setError("As novas senhas não coincidem.")
								return
							}
							if (!mutation.isPending) mutation.mutate()
						}}
					>
						<FieldGroup>
							{(Object.keys(empty) as (keyof typeof empty)[]).map((key) => (
								<Field key={key}>
									<FieldLabel htmlFor={`account-${key}`}>{labels[key]}</FieldLabel>
									<Input
										id={`account-${key}`}
										type={
											key.toLowerCase().includes("password") && !visible ? "password" : "text"
										}
										autoComplete={
											key === "currentPassword"
												? "current-password"
												: key.includes("Password")
													? "new-password"
													: "username"
										}
										value={fields[key]}
										onChange={(event) =>
											setFields((previous) => ({ ...previous, [key]: event.target.value }))
										}
										required={key !== "newUsername"}
										disabled={mutation.isPending || mutation.isSuccess}
									/>
								</Field>
							))}
							{error && <FieldError>{error}</FieldError>}
							<div className="flex flex-wrap justify-between gap-3">
								<Button
									type="button"
									variant="outline"
									aria-pressed={visible}
									onClick={() => setVisible(!visible)}
								>
									{visible ? "Ocultar senhas" : "Mostrar senhas"}
								</Button>
								<Button type="submit" disabled={mutation.isPending || mutation.isSuccess}>
									{mutation.isPending ? "Atualizando…" : "Alterar acesso"}
								</Button>
							</div>
							<RequestError error={mutation.error} />
							{mutation.isSuccess && (
								<Alert role="status">
									<AlertTitle>Acesso atualizado</AlertTitle>
									<AlertDescription>
										<p>
											O host invalidou sua sessão. Entre com as novas credenciais para
											continuar.
										</p>
										<Link to="/login" className={buttonVariants({ variant: "outline" })}>
											Entrar novamente
										</Link>
									</AlertDescription>
								</Alert>
							)}
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</>
	)
}
