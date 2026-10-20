import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve } from "node:path"

const root = resolve("dist")
const pages = new Set([
	"apps",
	"config",
	"pin",
	"password",
	"login",
	"welcome",
	"troubleshooting"
])
const types = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".woff2": "font/woff2",
	".ico": "image/x-icon",
	".png": "image/png"
}

createServer(async (request, response) => {
	try {
		const pathname = new URL(request.url, "http://127.0.0.1").pathname
		const name = pathname.replace(/^\//, "").replace(/\/$/, "")
		const relative =
			pathname === "/" ? "index.html" : pages.has(name) ? `${name}.html` : pathname.slice(1)
		if (
			relative !== "index.html" &&
			!pages.has(name) &&
			!pathname.startsWith("/assets/") &&
			!pathname.startsWith("/images/")
		)
			throw new Error("Not found")
		const file = resolve(root, relative)
		if (!file.startsWith(`${root}/`)) throw new Error("Invalid path")
		const data = await readFile(file)
		response.writeHead(200, {
			"Content-Type": types[extname(file)] || "application/octet-stream",
			"X-Frame-Options": "DENY",
			"Content-Security-Policy": "frame-ancestors 'none';"
		})
		response.end(data)
	} catch {
		response.writeHead(404)
		response.end()
	}
}).listen(4175, "127.0.0.1")
