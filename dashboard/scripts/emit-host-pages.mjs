import { cp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const dist = resolve(packageRoot, "dist")
const html = await readFile(resolve(dist, "index.html"), "utf8")
const licenses = resolve(dist, "licenses")
await mkdir(licenses, { recursive: true })
for (const [source, filename] of [
	["../LICENSE", "Apollo-LICENSE.txt"],
	["../NOTICE", "Apollo-NOTICE.txt"],
	["SHADCN_LICENSE.txt", "SHADCN-LICENSE.txt"],
	["THIRD_PARTY_NOTICES.md", "THIRD-PARTY-NOTICES.md"],
	["node_modules/zod/LICENSE", "ZOD-LICENSE.txt"],
	["node_modules/fflate/LICENSE", "FFLATE-LICENSE.txt"]
])
	await cp(resolve(packageRoot, source), resolve(licenses, filename))
for (const page of [
	"apps",
	"config",
	"pin",
	"password",
	"login",
	"welcome",
	"troubleshooting"
]) {
	await writeFile(resolve(dist, `${page}.html`), html)
}

await writeFile(
	resolve(dist, "ui-build.json"),
	`${JSON.stringify(
		{
			router: "file-based",
			entryPoints: [
				"/",
				"/apps",
				"/config",
				"/pin",
				"/password",
				"/login",
				"/welcome",
				"/troubleshooting"
			],
			mode: "react-dashboard",
			language: "pt-BR",
			validation: "candidate",
			releaseReady: false
		},
		null,
		2
	)}\n`
)

if (process.argv.includes("--host")) {
	const source = resolve(packageRoot, "..")
	const defaultBuild = resolve(source, "build")
	const build = process.env.SUNSHINE_ASSETS_DIR
		? resolve(process.env.SUNSHINE_ASSETS_DIR)
		: defaultBuild
	const normalize = (value) =>
		process.platform === "win32" ? value.replaceAll("\\", "/").toLowerCase() : value
	if (build !== defaultBuild) {
		const cache = await readFile(resolve(build, "CMakeCache.txt"), "utf8")
		const owner = cache.match(/^CMAKE_HOME_DIRECTORY:INTERNAL=(.+)$/m)?.[1].trim()
		if (!owner || normalize(owner) !== normalize(source))
			throw new Error("O destino não é um diretório CMake deste checkout.")
	}
	for (const path of [build, resolve(build, "assets"), resolve(build, "assets/web")]) {
		try {
			if ((await lstat(path)).isSymbolicLink())
				throw new Error("O destino de assets não pode ser um link simbólico.")
		} catch (error) {
			if (error.code !== "ENOENT") throw error
		}
	}
	const destination = resolve(build, "assets/web")
	await mkdir(resolve(build, "assets"), { recursive: true })
	await rm(destination, { recursive: true, force: true })
	await cp(dist, destination, { recursive: true })
	console.log(`Apollo UI assets staged: ${destination}`)
}
