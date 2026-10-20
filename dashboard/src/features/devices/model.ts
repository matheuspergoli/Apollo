import { bool, type Document, object, text } from "@/lib/documents"

export const permissions = [
	{
		group: "Sessão",
		key: "list",
		bit: 0x01000000,
		label: "Listar aplicativos",
		help: "Permite consultar a biblioteca."
	},
	{
		group: "Sessão",
		key: "view",
		bit: 0x02000000,
		label: "Visualizar stream",
		help: "Receber imagem e áudio.",
		suppressedBy: 0x04000000
	},
	{
		group: "Sessão",
		key: "launch",
		bit: 0x04000000,
		label: "Iniciar aplicativos",
		help: "Pode executar entradas e seus comandos no computador."
	},
	{
		group: "Entrada",
		key: "input_controller",
		bit: 0x00000100,
		label: "Controle",
		help: "Enviar entrada de gamepad."
	},
	{
		group: "Entrada",
		key: "input_touch",
		bit: 0x00000200,
		label: "Toque",
		help: "Enviar entrada touch."
	},
	{
		group: "Entrada",
		key: "input_pen",
		bit: 0x00000400,
		label: "Caneta",
		help: "Enviar entrada de caneta."
	},
	{
		group: "Entrada",
		key: "input_mouse",
		bit: 0x00000800,
		label: "Mouse",
		help: "Controlar o ponteiro."
	},
	{
		group: "Entrada",
		key: "input_kbd",
		bit: 0x00001000,
		label: "Teclado",
		help: "Enviar teclas ao host."
	},
	{
		group: "Operações",
		key: "clipboard_set",
		bit: 0x00010000,
		label: "Escrever área de transferência",
		help: "Enviar conteúdo do cliente ao host."
	},
	{
		group: "Operações",
		key: "clipboard_read",
		bit: 0x00020000,
		label: "Ler área de transferência",
		help: "Pode acessar conteúdo sensível copiado no host."
	},
	{
		group: "Operações",
		key: "file_upload",
		bit: 0x00040000,
		label: "Enviar arquivos",
		help: "Gravar arquivos enviados pelo cliente."
	},
	{
		group: "Operações",
		key: "file_dwnload",
		bit: 0x00080000,
		label: "Baixar arquivos",
		help: "Ler arquivos do computador."
	},
	{
		group: "Operações",
		key: "server_cmd",
		bit: 0x00100000,
		label: "Comandos do servidor",
		help: "Autoriza executar comandos cadastrados no host."
	}
]
export function deviceDraft(client: Document): Document {
	return structuredClone({
		...client,
		display_mode: text(client.display_mode),
		allow_client_commands: client.allow_client_commands ?? true,
		enable_legacy_ordering: client.enable_legacy_ordering ?? true,
		always_use_virtual_display: client.always_use_virtual_display ?? false,
		do: client.do ?? [],
		undo: client.undo ?? []
	})
}
export function serializeDevice(draft: Document) {
	const mode = text(draft.display_mode).trim()
	if (mode && !/^\d+x\d+x\d+(\.\d+)?$/.test(mode))
		throw new Error(
			"Use largura x altura x FPS, por exemplo 1920x1080x120 ou 1920x1080x59.94."
		)
	const perm = Number(draft.perm)
	if (!Number.isInteger(perm) || perm < 0 || perm > 0xffffffff)
		throw new Error("Máscara de permissões inválida.")
	const commands = (value: unknown) => {
		if (!Array.isArray(value)) throw new Error("Lista de comandos inválida.")
		return value
			.map(object)
			.filter((row) => text(row.cmd).trim())
			.map((row) => ({ cmd: text(row.cmd).trim(), elevated: bool(row.elevated) }))
	}
	return {
		uuid: text(draft.uuid),
		name: text(draft.name),
		display_mode: mode,
		perm: perm & 0x071f1f00,
		allow_client_commands: bool(draft.allow_client_commands),
		enable_legacy_ordering: bool(draft.enable_legacy_ordering),
		always_use_virtual_display: bool(draft.always_use_virtual_display),
		do: commands(draft.do),
		undo: commands(draft.undo)
	}
}
export function pairingLink(
	host: string,
	port: string,
	code: string,
	phrase: string,
	name: string
) {
	const address = host.trim()
	if (!address || /[\s/@?#]/.test(address))
		throw new Error("Informe somente IP ou nome do host, sem protocolo ou caminho.")
	if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
		throw new Error("Porta do host inválida.")
	const ipv6 = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address
	const url = new URL(`art://${ipv6}:${port}`)
	url.search = new URLSearchParams({ pin: code, passphrase: phrase, name }).toString()
	return url.href
}
