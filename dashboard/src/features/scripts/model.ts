import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import { request } from "@/lib/api"
import { action, type Document } from "@/lib/documents"

export const scriptLimit = 128 * 1024
const argumentsSchema = z
	.array(
		z
			.string()
			.min(1)
			.max(1024)
			.refine(
				(value) => !/[\0\r\n"]/.test(value) && new TextEncoder().encode(value).length <= 1024
			)
	)
	.max(16)
export const scriptFileSchema = z.strictObject({
	name: z
		.string()
		.min(5)
		.max(180)
		.regex(/^[^/\\\0\r\n:]+\.ps1$/i),
	data: z
		.string()
		.min(4)
		.max(4 * Math.ceil(scriptLimit / 3))
		.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
})
export const scriptReferenceSchema = z.union([
	z.strictObject({
		file: scriptFileSchema,
		arguments: z.array(z.string()).max(16).optional()
	}),
	z.strictObject({
		id: z.string().regex(/^[a-f0-9]{32}$/),
		revision: z.string().regex(/^[a-f0-9]{64}$/),
		name: z.string().max(180).optional(),
		number: z.number().int().min(1).max(16).optional(),
		arguments: z.array(z.string()).max(16).optional()
	})
])
export type ScriptReference = z.infer<typeof scriptReferenceSchema>
export type ScriptFile = z.infer<typeof scriptFileSchema>
const recordSchema = z.object({
	id: z.string().regex(/^[a-f0-9]{32}$/),
	name: z.string(),
	revisions: z
		.array(
			z.object({
				revision: z.string().regex(/^[a-f0-9]{64}$/),
				number: z.number().int(),
				size: z.number().int()
			})
		)
		.max(16),
	uses: z.array(z.object({ uuid: z.string(), name: z.string() }))
})
export type ScriptRecord = z.infer<typeof recordSchema>
export const scriptsOptions = queryOptions({
	queryKey: ["host", "scripts"],
	queryFn: async ({ signal }) =>
		z
			.object({
				status: z.literal(true),
				supported: z.boolean(),
				scripts: z.array(recordSchema).max(128)
			})
			.parse(await request("scripts", { signal })),
	staleTime: 0
})

export function scriptName(reference: ScriptReference) {
	return "file" in reference ? reference.file.name : reference.name || "Script salvo"
}

export function decodeScript(data: string) {
	const binary = atob(data)
	const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0))
	return { bytes, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }
}

export async function readScriptFile(file: File): Promise<ScriptFile> {
	if (!file.size || file.size > scriptLimit)
		throw new Error("Selecione um script .ps1 não vazio de até 128 KiB.")
	const bytes = new Uint8Array(await file.arrayBuffer())
	let text: string
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		throw new Error("Salve o script em UTF-8 antes de adicioná-lo.")
	}
	if (text.includes("\0"))
		throw new Error("O script contém bytes nulos e não pode ser utilizado.")
	const bom = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191
	if (!bom && bytes.some((value) => value >= 128))
		throw new Error(
			"Salve em UTF-8 com BOM para preservar os caracteres no Windows PowerShell."
		)
	let binary = ""
	for (let start = 0; start < bytes.length; start += 8192)
		binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
	return scriptFileSchema.parse({ name: file.name, data: btoa(binary) })
}

export async function loadScript(reference: ScriptReference): Promise<ScriptFile> {
	if ("file" in reference) return reference.file
	const response = await action("scripts/read", reference)
	return z.object({ name: z.string(), data: z.string() }).parse(response.script)
}

export function scriptSlots(app: Document) {
	const result: { owner: Document; key: string; label: string }[] = [
		{ owner: app, key: "cmd", label: "Inicialização" }
	]
	for (const [key, label] of [
		["prep-cmd", "Preparação"],
		["state-cmd", "Sessão"]
	]) {
		if (Array.isArray(app[key]))
			(app[key] as unknown[]).forEach((row, index) => {
				if (row && typeof row === "object" && !Array.isArray(row))
					for (const part of ["do", "undo"])
						result.push({
							owner: row as Document,
							key: part,
							label: `${label}, etapa ${index + 1}: ${part === "do" ? "executar" : "desfazer"}`
						})
			})
	}
	return result
}

export function applicationScripts(app: Document) {
	return scriptSlots(app)
		.filter(({ owner, key }) => owner[`${key}-script`] !== undefined)
		.map((slot) => ({
			...slot,
			reference: scriptReferenceSchema.parse(slot.owner[`${slot.key}-script`])
		}))
}

export function validateApplicationScripts(app: Document) {
	const scripts = applicationScripts(app)
	if (scripts.length > 32) throw new Error("Use até 32 vínculos de scripts por aplicativo.")
	for (const { owner, key, label, reference } of scripts) {
		if ("file" in reference) {
			const { bytes, text } = decodeScript(reference.file.data)
			const bom = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191
			if (
				!bytes.length ||
				bytes.length > scriptLimit ||
				text.includes("\0") ||
				(!bom && bytes.some((value) => value >= 128))
			)
				throw new Error(
					`${label}: use um script de até 128 KiB em ASCII ou UTF-8 com BOM, sem bytes nulos.`
				)
		}
		if (owner[key] !== "" && owner[key] !== undefined)
			throw new Error(`${label}: escolha comando manual ou script, não os dois.`)
		if (!argumentsSchema.safeParse(reference.arguments || []).success)
			throw new Error(
				`${label}: preencha os argumentos sem aspas duplas ou quebras de linha, até 1024 bytes por argumento.`
			)
	}
	return scripts
}
