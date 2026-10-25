import { cp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { dependencyNotices } from "./notices.mjs"

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const { version } = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"))
const dist = resolve(packageRoot, "dist")
const html = await readFile(resolve(dist, "index.html"), "utf8")
const manager = process.env.npm_execpath
if (!manager || !basename(manager).toLowerCase().includes("pnpm"))
	throw new Error("Build the dashboard with pnpm")
const managerIsScript = /\.[cm]?js$/i.test(manager)
const report = JSON.parse(
	execFileSync(
		managerIsScript ? process.execPath : manager,
		[...(managerIsScript ? [manager] : []), "licenses", "list", "--prod", "--json"],
		{ cwd: packageRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
	)
)
await cp(resolve(packageRoot, "../LICENSE"), resolve(dist, "LICENSE.txt"))
await writeFile(
	resolve(dist, "NOTICE.txt"),
	await dependencyNotices(report, await readFile(resolve(packageRoot, "../NOTICE"), "utf8"))
)
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
			version
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

import { execFileSync } from "node:child_process"
