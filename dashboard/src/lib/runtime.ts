export const previewPath = "/assets/apollo-preview/index.html"

export function isPackagedPreview() {
	return window.location.pathname === previewPath
}
