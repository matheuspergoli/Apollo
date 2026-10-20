import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, resolve } from "node:path"

const root = resolve("dist")
const prefix = "/assets/apollo-preview/"
const types = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".map": "application/json"
}

createServer(async (request, response) => {
	try {
		const path = new URL(request.url, "http://127.0.0.1").pathname
		if (path === "/config") {
			response.writeHead(200, { "Content-Type": "text/html" })
			response.end("<h1>Compatibility config fixture</h1>")
			return
		}
		if (!path.startsWith(prefix)) throw new Error("Not found")
		const file = resolve(root, path.slice(prefix.length))
		if (!file.startsWith(`${root}/`)) throw new Error("Invalid path")
		const data = await readFile(file)
		response.writeHead(200, {
			"Content-Type": types[extname(file)] || "application/octet-stream"
		})
		response.end(data)
	} catch {
		response.writeHead(404)
		response.end()
	}
}).listen(4175, "127.0.0.1")
