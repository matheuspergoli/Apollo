import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"

const root = path.resolve(import.meta.dirname, "../..")
const web = path.join(root, "src_assets/common/assets/web")
const source = fs.readFileSync(path.join(web, "config.html"), "utf8")
const literal = source.match(/tabs:\s*(\[[\s\S]*?\n        \]),/)
if (!literal) throw new Error("Configuration defaults were not found")
// One-time extraction of the reviewed, literal-only upstream defaults, never user input.
const tabs = vm.runInNewContext(`(${literal[1]})`, Object.create(null), { timeout: 100 })
const dictionaries = ["pt_BR", "en"].map((locale) => JSON.parse(fs.readFileSync(path.join(web, `public/assets/locale/${locale}.json`), "utf8")))
function plain(value) {
	return value.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}
function translated(key) {
	for (const dictionary of dictionaries) {
		const value = key.split(".").reduce((node, part) => node?.[part], dictionary)
		if (typeof value === "string") return plain(value)
	}
	return ""
}
function templateText(value) {
	return plain(value.replace(/{{\s*\$t[p]?\(['"]([^'"]+)['"]\)\s*}}/g, (_all, key) => translated(key)).replace(/{{.*?}}/g, ""))
}
const metadata = new Map()
function walk(directory) {
	for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, file.name)
		if (file.isDirectory()) walk(full)
		else if (file.name.endsWith(".vue")) {
			const text = fs.readFileSync(full, "utf8")
			for (const select of text.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
				const key = select[1].match(/v-model="config\.([\w]+)"/)?.[1]
				if (!key) continue
				const options = [...select[2].matchAll(/<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map((match) => ({ value: match[1], label: templateText(match[2]) || match[1] }))
				metadata.set(key, { ...metadata.get(key), options: [...new Map(options.map((option) => [option.value, option])).values()] })
			}
			for (const input of text.matchAll(/<input\b([^>]*)\/?>/g)) {
				const key = input[1].match(/v-model="config\.([\w]+)"/)?.[1]
				if (!key) continue
				const extra = {}
				for (const limit of ["min", "max", "step"]) {
					const value = input[1].match(new RegExp(`(?:^|\\s)${limit}="([^"]*)"`))?.[1]
					if (value && Number.isFinite(Number(value))) extra[limit] = Number(value)
				}
				metadata.set(key, { ...metadata.get(key), ...extra })
			}
		}
	}
}
walk(path.join(web, "configs"))
const names = { general: "Geral e automação", input: "Controles e entrada", av: "Áudio e display", network: "Rede e segurança", files: "Arquivos e certificados", advanced: "Captura e codecs", nv: "NVIDIA NVENC", qsv: "Intel QuickSync", amd: "AMD AMF", vt: "VideoToolbox", vaapi: "VA-API", sw: "Encoder de software" }
const schema = tabs.map((tab) => ({
	id: tab.id, title: names[tab.id],
	fields: Object.entries(tab.options).map(([key, defaultValue]) => ({
		key, defaultValue,
		label: translated(`config.${key}`) || translated(`config.${key}_windows`) || key,
		description: translated(`config.${key}_desc`) || translated(`config.${key}_desc_windows`),
		...metadata.get(key)
	}))
}))
const file = path.join(root, "dashboard/src/features/settings/schema.json")
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, JSON.stringify(schema, null, 2) + "\n")
console.log(`${schema.length} sections; ${schema.reduce((sum, section) => sum + section.fields.length, 0)} fields extracted`)
