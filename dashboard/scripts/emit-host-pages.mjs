import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const dist = resolve("dist")
const html = await readFile(resolve(dist, "index.html"), "utf8")
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
			mode: "full-migration-in-progress",
			releaseReady: false
		},
		null,
		2
	)}\n`
)

if (process.argv.includes("--host")) {
	const destination = process.env.SUNSHINE_ASSETS_DIR
		? resolve(process.env.SUNSHINE_ASSETS_DIR, "assets/web")
		: resolve("../build/assets/web")
	await mkdir(destination, { recursive: true })
	await cp(dist, destination, { recursive: true })
	console.log(`Apollo UI assets staged: ${destination}`)
}
