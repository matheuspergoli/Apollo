// Shared by the packaged native integration and the fast browser regressions.
// A rendered heading alone does not prove that the host's stylesheet loaded:
// unstyled modal backdrops can cover otherwise visible, enabled controls.
export async function assertHostStyles(page) {
	const state = await page.evaluate(() => ({
		stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
			.filter((link) => new URL(link.href).origin === location.origin)
			.map((link) => ({ path: new URL(link.href).pathname, loaded: Boolean(link.sheet) })),
		background: getComputedStyle(document.documentElement)
			.getPropertyValue("--background")
			.trim()
	}))
	if (
		!state.stylesheets.length ||
		state.stylesheets.some((stylesheet) => !stylesheet.loaded) ||
		!state.background
	)
		throw new Error(`Host stylesheet did not load: ${JSON.stringify(state)}`)
}
