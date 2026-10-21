import { existsSync, readFileSync } from "node:fs"
import { expect, it } from "vitest"

function manifest(relative: string) {
	return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")) as {
		dependencies?: Record<string, string>
		devDependencies?: Record<string, string>
	}
}

it("has one fixed pt-BR HTML interface and no translation dependencies", () => {
	expect(readFileSync(new URL("../../index.html", import.meta.url), "utf8")).toContain(
		'lang="pt-BR"'
	)
	for (const file of ["../../package.json", "../../../package.json"]) {
		const pkg = manifest(file)
		const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
		for (const dependency of ["i18next", "react-i18next", "i18next-cli", "vue", "vue-i18n"])
			expect(names).not.toContain(dependency)
	}
})

it("has no old catalogs, providers, Crowdin/gettext scripts or legacy frontend", () => {
	for (const file of [
		"../i18n.ts",
		"../locales",
		"../../i18next.config.ts",
		"../../../crowdin.yml",
		"../../../scripts/_locale.py",
		"../../../src_assets/common/assets/web"
	]) {
		expect(existsSync(new URL(file, import.meta.url)), file).toBe(false)
	}
})
