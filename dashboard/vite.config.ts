import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	plugins: [tailwindcss(), react()],
	server: { port: 5174, strictPort: true },
	build: { outDir: "dist", sourcemap: true }
})
