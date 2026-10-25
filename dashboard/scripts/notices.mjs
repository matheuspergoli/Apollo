import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const licenseFile = /^(licen[cs]e|copying|notice|ofl)([._-].*)?$/i

export async function dependencyNotices(report, notice) {
	if (!report || typeof report !== "object" || Array.isArray(report))
		throw new Error("Invalid dependency license report")
	const blocks = new Map()
	for (const packages of Object.values(report)) {
		if (!Array.isArray(packages)) throw new Error("Invalid dependency license group")
		for (const entry of packages) {
			if (
				!entry ||
				typeof entry.name !== "string" ||
				!Array.isArray(entry.versions) ||
				!entry.versions.length ||
				!Array.isArray(entry.paths) ||
				!entry.paths.length
			)
				throw new Error("Incomplete dependency license metadata")
			const label = `${entry.name}@${entry.versions.join(", ")}`
			for (const path of entry.paths) {
				const files = (await readdir(path, { withFileTypes: true })).filter(
					(file) => file.isFile() && licenseFile.test(file.name)
				)
				if (!files.length) throw new Error(`Missing license text: ${label}`)
				for (const file of files) {
					const text = (await readFile(join(path, file.name), "utf8"))
						.replaceAll("\r\n", "\n")
						.trim()
					if (!text) throw new Error(`Empty license text: ${label}`)
					if (!blocks.has(text)) blocks.set(text, new Set())
					blocks.get(text).add(label)
				}
			}
		}
	}
	if (!blocks.size) throw new Error("Dependency license report is empty")
	const sections = [...blocks.entries()]
		.map(([text, names]) => ({ text, names: [...names].sort().join("\n") }))
		.sort((a, b) => a.names.localeCompare(b.names, "en"))
	return `${notice.replaceAll("\r\n", "\n").trim()}\n\nFrontend dependencies\n\n${sections.map(({ names, text }) => `${names}\n\n${text}`).join("\n\n---\n\n")}\n`
}
