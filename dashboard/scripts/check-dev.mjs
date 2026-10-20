import assert from "node:assert/strict"
import { createServer } from "vite"

const server = await createServer({
	logLevel: "error",
	server: { host: "127.0.0.1", port: 0, strictPort: true }
})

try {
	await server.listen()
	const address = server.httpServer?.address()
	if (!address || typeof address === "string")
		throw new Error("Dev server did not bind a test port")
	const origin = `http://127.0.0.1:${address.port}`
	for (const path of [
		"/",
		"/src/styles.css",
		"/src/routeTree.gen.ts",
		"/src/routes/_host.config.tsx",
		"/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
		"/node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"
	]) {
		const response = await fetch(origin + path)
		assert.equal(response.status, 200, `${path}: ${await response.text()}`)
	}
	console.log(
		"Dev integration passed: CSS, generated routes and both local Latin fonts returned HTTP 200."
	)
} finally {
	await server.close()
}
