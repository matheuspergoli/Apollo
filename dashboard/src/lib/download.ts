export function downloadFile(
	name: string,
	data: string | Blob,
	type = "text/plain;charset=utf-8"
) {
	const url = URL.createObjectURL(typeof data === "string" ? new Blob([data], { type }) : data)
	const link = document.createElement("a")
	link.href = url
	link.download = name.replace(/[<>:"/\\|?*\r\n]/g, "_")
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
