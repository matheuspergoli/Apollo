import type { z } from "zod"
import type { Document } from "./documents"

function inspect(value: unknown, depth = 0) {
	if (depth > 20) throw new Error("O JSON tem níveis de estrutura demais.")
	if (typeof value === "string" && value.includes("\0"))
		throw new Error("O JSON contém um caractere nulo inválido.")
	if (!value || typeof value !== "object") return
	for (const [key, child] of Object.entries(value)) {
		if (key.length > 128) throw new Error("O JSON contém uma chave excessivamente longa.")
		if (key.includes("\0") || ["__proto__", "prototype", "constructor"].includes(key))
			throw new Error("O JSON contém uma chave insegura.")
		inspect(child, depth + 1)
	}
}

export function readConfigurationJson(raw: string, limit: number): Document {
	if (new TextEncoder().encode(raw).length > limit)
		throw new Error(`Use um JSON de até ${limit / 1024} KiB.`)
	let parsed: unknown
	try {
		parsed = JSON.parse(raw.replace(/^\uFEFF/, ""))
	} catch {
		throw new Error("JSON inválido. Confira aspas, vírgulas e a documentação do arquivo.")
	}
	inspect(parsed)
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new Error("O JSON deve conter um objeto de configuração.")
	return parsed as Document
}

export function parseContract<T>(schema: z.ZodType<T>, value: unknown, context: string): T {
	const parsed = schema.safeParse(value)
	if (parsed.success) return parsed.data
	const messages = parsed.error.issues.slice(0, 6).map((issue) => {
		const reason =
			issue.code === "unrecognized_keys"
				? "chaves não permitidas"
				: issue.code === "invalid_type"
					? "tipo incorreto"
					: issue.code === "too_big" || issue.code === "too_small"
						? "fora dos limites permitidos"
						: "valor ou estrutura inválida"
		return `${issue.path.join(".").slice(0, 160) || "raiz"}: ${reason}`
	})
	throw new Error(`${context}: ${messages.join("; ")}.`)
}

export async function configurationArchive(folder: string, files: Record<string, string>) {
	if (
		!/^[a-z0-9-]+$/.test(folder) ||
		Object.keys(files).some(
			(name) =>
				!/^[a-zA-Z0-9_./-]+$/.test(name) ||
				name.startsWith("/") ||
				name.split("/").some((part) => !part || part === "." || part === "..")
		)
	)
		throw new Error("Nome de arquivo de configuração inválido.")
	const { strToU8, zipSync } = await import("fflate")
	const bytes = zipSync(
		Object.fromEntries(
			Object.entries(files).map(([name, content]) => [`${folder}/${name}`, strToU8(content)])
		)
	)
	return new Blob([new Uint8Array(bytes)], { type: "application/zip" })
}
