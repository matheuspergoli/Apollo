import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	base: "/",
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		tailwindcss(),
		react()
	],
	server: { port: 5174, strictPort: true },
	build: { outDir: "dist", sourcemap: process.env.APOLLO_UI_SOURCEMAP === "true" }
})
