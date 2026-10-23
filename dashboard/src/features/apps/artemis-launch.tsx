import { IconPlayerPlay } from "@tabler/icons-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { RequestError } from "@/components/request-error"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from "@/components/ui/dialog"
import type { Document } from "@/lib/documents"
import { launchLink } from "./model"

export function ArtemisLaunch({
	app,
	hostUuid,
	hostName
}: {
	app: Document
	hostUuid: string
	hostName: string
}) {
	const [open, setOpen] = useState(false)
	const [qr, setQr] = useState("")
	const [error, setError] = useState<Error | null>(null)
	const [copied, setCopied] = useState(false)
	const link = launchLink(app, hostUuid, hostName)
	useEffect(() => {
		if (!open) return
		let cancelled = false
		setError(null)
		setCopied(false)
		setQr("")
		QRCode.toDataURL(link, { width: 256, margin: 2 })
			.then((value) => {
				if (!cancelled) setQr(value)
			})
			.catch(() => {
				if (!cancelled)
					setError(
						new Error(
							"Não foi possível gerar o QR. Use o link neste dispositivo ou exporte o atalho .art."
						)
					)
			})
		return () => {
			cancelled = true
		}
	}, [open, link])
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button variant="outline" disabled={!hostUuid} />}>
				<IconPlayerPlay />
				Abrir no Artemis
			</DialogTrigger>
			<DialogContent className="max-h-[85dvh] min-w-0 overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Continuar no Artemis</DialogTitle>
					<DialogDescription>
						O link abre o Artemis no dispositivo onde este navegador está aberto, se ele
						estiver instalado e associado ao protocolo art://. Não envia um comando do PC para
						abrir o aplicativo no celular.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm">
					No celular, escaneie o QR ou abra este painel nele. O host precisa estar previamente
					adicionado e pareado no Artemis. Se não houver aplicativo associado, use o atalho
					.art ou abra o Artemis manualmente.
				</p>
				{qr && (
					<img
						src={qr}
						alt="QR para abrir aplicativo no Artemis"
						className="mx-auto size-48 bg-white"
					/>
				)}
				<RequestError error={error} />
				{copied && (
					<p role="status" className="text-sm">
						Link copiado. Abra-o no dispositivo com Artemis.
					</p>
				)}
				<DialogFooter className="min-w-0 flex-col flex-wrap sm:flex-row">
					<Button
						variant="outline"
						className="w-full sm:w-auto"
						onClick={() => {
							navigator.clipboard
								.writeText(link)
								.then(() => setCopied(true))
								.catch(() => setError(new Error("Não foi possível copiar o link.")))
						}}
					>
						Copiar link
					</Button>
					<a className={buttonVariants({ className: "w-full sm:w-auto" })} href={link}>
						Abrir Artemis neste dispositivo
					</a>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
