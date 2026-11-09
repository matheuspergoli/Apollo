import { defineConfig } from "@playwright/test"

export default defineConfig({
	testDir: "./tests/browser",
	use: {
		baseURL: "http://127.0.0.1:4174",
		browserName: "chromium",
		screenshot: "only-on-failure",
		trace: "retain-on-failure"
	},
	webServer: [
		{
			command: "pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort",
			url: "http://127.0.0.1:4174",
			reuseExistingServer: false
		},
		{
			command: "node tests/fixtures/packaged-host.mjs",
			url: "http://127.0.0.1:4175/",
			reuseExistingServer: false
		}
	]
})
