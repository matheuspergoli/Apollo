import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { ThemeSelect } from "@/components/theme-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"

export function AccessPage({
	setup = false,
	created = false
}: {
	setup?: boolean
	created?: boolean
}) {
	const [username, setUsername] = useState(setup ? "apollo" : "")
	const [password, setPassword] = useState("")
	const [confirmation, setConfirmation] = useState("")
	const [visible, setVisible] = useState(false)
	const [validation, setValidation] = useState("")
	const client = useQueryClient()
	const navigate = useNavigate()
	const mutation = useMutation({
		mutationKey: ["access", setup ? "setup" : "login"],
		gcTime: 0,
		retry: false,
		mutationFn: async () => {
			if (setup) {
				const result = await post("password", {
					newUsername: username,
					newPassword: password,
					confirmNewPassword: confirmation
				})
				if (
					!result ||
					typeof result !== "object" ||
					!("status" in result) ||
					result.status !== true
				) {
					throw new Error(
						"Não foi possível criar o acesso. Confira os dados e tente novamente."
					)
				}
			} else await post("login", { username, password }, false)
		},
		onSuccess: async () => {
			setPassword("")
			setConfirmation("")
			client.removeQueries()
			if (setup) await navigate({ to: "/login", search: { created: true }, replace: true })
			else await navigate({ to: "/", replace: true })
		}
	})

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (mutation.isPending || mutation.isSuccess) return
		setValidation("")
		mutation.reset()
		if (setup && password !== confirmation) {
			setValidation("As senhas não coincidem. Confira os dois campos.")
			return
		}
		mutation.mutate()
	}

	const busy = mutation.isPending || mutation.isSuccess
	return (
		<main className="mx-auto min-h-screen max-w-6xl px-5 py-8 md:px-10 lg:py-14">
			<header className="mb-12 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
				<div className="flex items-baseline gap-3">
					<span className="font-semibold tracking-tight">Apollo</span>
					<span className="text-muted-foreground text-xs">Laboratório</span>
				</div>
				<ThemeSelect />
			</header>
			<div className="grid items-start gap-10 md:grid-cols-2 lg:gap-24">
				<section className="space-y-5">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
						{setup ? "Primeiro acesso · 1 de 2" : "Acesso ao host"}
					</p>
					<h1 className="max-w-sm font-semibold text-4xl leading-tight tracking-tight lg:text-5xl">
						{setup ? "Prepare seu host." : "Acesse seu host."}
					</h1>
					<p className="max-w-md text-base text-muted-foreground leading-7">
						{setup
							? "Crie o acesso ao painel. Depois, vincule o Artemis e ajuste seu streaming."
							: "Vincule seus dispositivos e revise o display, a captura e as configurações do streaming."}
					</p>
					<p className="max-w-md border-l-2 pl-4 text-muted-foreground text-sm leading-6">
						Este acesso pertence a este host Apollo. Não é sua conta Steam nem o PIN de
						pareamento. A instalação original continua independente.
					</p>
				</section>
				<Card>
					<CardHeader>
						<CardTitle className="text-xl">
							{setup ? "Criar acesso ao painel" : "Entrar no painel"}
						</CardTitle>
						<CardDescription>
							Use seu gerenciador de senhas. O painel não grava sua senha no armazenamento do
							site.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{created && (
							<Alert role="status" className="mb-5">
								<AlertTitle>Acesso criado com sucesso</AlertTitle>
								<AlertDescription>
									Entre com as credenciais que você acabou de criar para continuar no painel.
									Nenhuma senha foi salva no navegador pelo Apollo.
								</AlertDescription>
							</Alert>
						)}
						<form onSubmit={submit}>
							<FieldGroup>
								<Field data-disabled={busy}>
									<FieldLabel htmlFor="usernameInput">Usuário</FieldLabel>
									<Input
										id="usernameInput"
										value={username}
										onChange={(event) => setUsername(event.target.value)}
										autoComplete="username"
										autoCapitalize="none"
										spellCheck={false}
										required
										autoFocus
										disabled={busy}
										className="h-11 text-base"
									/>
								</Field>
								<Field data-disabled={busy}>
									<FieldLabel htmlFor="passwordInput">Senha</FieldLabel>
									<Input
										id="passwordInput"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										type={visible ? "text" : "password"}
										autoComplete={setup ? "new-password" : "current-password"}
										required
										disabled={busy}
										className="h-11 text-base"
									/>
								</Field>
								{setup && (
									<Field data-disabled={busy} data-invalid={Boolean(validation)}>
										<FieldLabel htmlFor="confirmPasswordInput">Confirmar senha</FieldLabel>
										<Input
											id="confirmPasswordInput"
											value={confirmation}
											onChange={(event) => setConfirmation(event.target.value)}
											type={visible ? "text" : "password"}
											autoComplete="new-password"
											aria-invalid={Boolean(validation)}
											aria-describedby={validation ? "confirmation-error" : undefined}
											required
											disabled={busy}
											className="h-11 text-base"
										/>
										{validation && (
											<FieldError id="confirmation-error">{validation}</FieldError>
										)}
									</Field>
								)}
								<div className="flex justify-end">
									<Button
										type="button"
										variant="link"
										aria-pressed={visible}
										onClick={() => setVisible(!visible)}
										className="min-h-10"
									>
										{visible ? "Ocultar senha" : "Mostrar senha"}
									</Button>
								</div>
								<Button
									type="submit"
									disabled={busy}
									aria-busy={mutation.isPending}
									className="min-h-11 w-full text-sm"
								>
									{mutation.isPending
										? "Aguarde…"
										: mutation.isSuccess
											? "Acesso autorizado"
											: setup
												? "Criar acesso e continuar"
												: "Entrar no painel"}
								</Button>
								{mutation.error && (
									<Alert variant="destructive">
										<AlertDescription>{mutation.error.message}</AlertDescription>
									</Alert>
								)}
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
			</div>
			<footer className="mt-12 flex flex-wrap gap-5 border-t pt-5 text-muted-foreground text-xs">
				<span>Configuração independente</span>
				<a
					href="https://github.com/ClassicOldSong/Apollo/blob/master/LICENSE"
					target="_blank"
					rel="noreferrer"
					className="underline"
				>
					Licença Apollo
				</a>
				<a
					href="https://github.com/ClassicOldSong/Apollo/blob/master/NOTICE"
					target="_blank"
					rel="noreferrer"
					className="underline"
				>
					Avisos de terceiros
				</a>
			</footer>
		</main>
	)
}
