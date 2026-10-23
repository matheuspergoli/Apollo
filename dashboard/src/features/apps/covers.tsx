import { useMutation } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { RequestError } from "@/components/request-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { action, object, text } from "@/lib/documents"

type Cover = { name: string; key: string; url: string }
async function storeCover(data: unknown) {
	const response = await action("covers/upload", data)
	const path = text(response.path)
	if (!path) throw new Error("O host não informou o caminho da capa gravada.")
	return path
}
export async function findCovers(name: string): Promise<Cover[]> {
	const search = name.trim().replace(/\s+/g, ".").toLowerCase()
	if (!search) throw new Error("Informe primeiro o nome do aplicativo.")
	const bucket =
		name
			.slice(0, 2)
			.toLowerCase()
			.replace(/[^a-z\d]/g, "") || "@"
	const base = "https://raw.githubusercontent.com/LizardByte/GameDB/gh-pages"
	const response = await fetch(`${base}/buckets/${bucket}.json`, {
		signal: AbortSignal.timeout(10_000)
	})
	if (!response.ok) throw new Error("Não foi possível consultar o catálogo de capas.")
	const entries = object(await response.json())
	const ids = Object.entries(entries)
		.filter(
			([id, value]) =>
				/^\d+$/.test(id) &&
				text(object(value).name).replace(/\s+/g, ".").toLowerCase().startsWith(search)
		)
		.map(([id]) => id)
	const covers: Cover[] = []
	for (let start = 0; start < ids.length; start += 8) {
		const batch = await Promise.all(
			ids.slice(start, start + 8).map(async (id) => {
				try {
					const result = await fetch(`${base}/games/${id}.json`, {
						signal: AbortSignal.timeout(10_000)
					})
					if (!result.ok) return null
					const game = object(await result.json())
					const cover = object(game.cover)
					const url = new URL(text(cover.url), "https://images.igdb.com")
					const slug = url.pathname.split("/").at(-1)?.split(".")[0]
					if (url.hostname !== "images.igdb.com" || !slug || !/^[\w-]+$/.test(slug))
						return null
					return {
						name: text(game.name),
						key: `igdb_${id}`,
						url: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${slug}.png`
					}
				} catch {
					return null
				}
			})
		)
		covers.push(...batch.filter((item): item is Cover => item !== null))
	}
	return covers
}

export function CoverPicker({
	name,
	path,
	onChange
}: {
	name: string
	path: string
	onChange: (path: string) => void
}) {
	const [open, setOpen] = useState(false)
	const fileInput = useRef<HTMLInputElement>(null)
	const [fileName, setFileName] = useState("")
	const [storedPath, setStoredPath] = useState("")
	const search = useMutation({ mutationFn: () => findCovers(name) })
	const upload = useMutation({
		mutationFn: async (cover: Cover) => storeCover({ key: cover.key, url: cover.url }),
		onSuccess: (path) => {
			onChange(path)
			setStoredPath(path)
			setOpen(false)
		}
	})
	const fileUpload = useMutation({
		mutationFn: async (file: File) => {
			if (file.size > 10 * 1024 * 1024) throw new Error("Use uma imagem PNG de até 10 MiB.")
			const bytes = new Uint8Array(await file.arrayBuffer())
			if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte))
				throw new Error("O arquivo deve ser uma imagem PNG válida.")
			const data = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(String(reader.result).split(",")[1])
				reader.onerror = () => reject(new Error("Não foi possível ler a imagem."))
				reader.readAsDataURL(file)
			})
			return storeCover({ key: `local_${crypto.randomUUID()}`, data })
		},
		onSuccess: (path) => {
			onChange(path)
			setStoredPath(path)
		}
	})
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-3">
				<Button
					type="button"
					variant="outline"
					disabled={search.isPending || upload.isPending}
					onClick={() => {
						setOpen(true)
						search.mutate()
					}}
				>
					{search.isPending ? "Buscando…" : "Buscar capas online"}
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={fileUpload.isPending}
					onClick={() => fileInput.current?.click()}
				>
					{fileUpload.isPending ? "Enviando capa…" : "Selecionar e enviar PNG"}
				</Button>
				<span className="self-center text-muted-foreground text-xs">
					{fileName || "Nenhum arquivo selecionado"}
				</span>
				<Input
					ref={fileInput}
					type="file"
					accept="image/png"
					aria-label="Enviar capa PNG"
					disabled={fileUpload.isPending}
					onChange={(event) => {
						const file = event.target.files?.[0]
						if (file) {
							setStoredPath("")
							setFileName(file.name)
							fileUpload.mutate(file)
						}
						event.target.value = ""
					}}
					className="hidden"
				/>
			</div>
			<p className="text-muted-foreground text-xs">
				Selecionar PNG envia uma cópia para config/covers no host; não mantém o caminho
				original do dispositivo. Para usar uma imagem já existente no host, preencha Caminho da
				capa com o caminho completo, sem aspas. A busca online só ocorre quando solicitada.
			</p>
			<RequestError error={fileUpload.error} />
			{storedPath && path === storedPath && (
				<Alert role="status">
					<AlertTitle>Cópia de capa recebida pelo host</AlertTitle>
					<AlertDescription>
						<span className="break-all font-mono">{storedPath}</span> Salve o aplicativo para
						usar essa capa na biblioteca.
					</AlertDescription>
				</Alert>
			)}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>Capas para {name}</DialogTitle>
						<DialogDescription>
							Escolha uma imagem para baixar no host. O aplicativo só é atualizado ao salvar.
						</DialogDescription>
					</DialogHeader>
					<RequestError error={search.error || upload.error} />
					{search.isPending && <p role="status">Consultando catálogo…</p>}
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						{search.data?.map((cover) => (
							<Button
								key={cover.key}
								type="button"
								variant="outline"
								className="h-auto flex-col gap-2 p-2"
								disabled={upload.isPending}
								onClick={() => {
									setStoredPath("")
									upload.mutate(cover)
								}}
							>
								<img
									src={cover.url}
									alt={cover.name}
									loading="lazy"
									className="aspect-[2/3] w-full object-cover"
								/>
								<span className="w-full truncate text-xs">{cover.name}</span>
							</Button>
						))}
					</div>
					{search.isSuccess && !search.data.length && (
						<p className="text-muted-foreground text-sm">
							Nenhuma capa encontrada. Use um arquivo PNG ou informe um caminho no host.
						</p>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
