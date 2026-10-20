import { type Document, object, text } from "@/lib/documents"

export const appDefaults: Document = {
	name: "",
	output: "",
	cmd: "",
	"working-dir": "",
	"exclude-global-prep-cmd": false,
	"exclude-global-state-cmd": false,
	elevated: false,
	"auto-detach": true,
	"wait-all": true,
	"exit-timeout": 5,
	"prep-cmd": [],
	"state-cmd": [],
	detached: [],
	"image-path": "",
	"scale-factor": 100,
	"use-app-identity": false,
	"per-client-app-identity": false,
	"allow-client-commands": true,
	"virtual-display": false,
	"terminate-on-pause": false,
	gamepad: ""
}
export function appDraft(value: Document = {}) {
	return structuredClone({ ...appDefaults, ...value })
}
export function validateApp(draft: Document): Document {
	if (!text(draft.name).trim() || /[\r\n]/.test(text(draft.name)))
		throw new Error("Informe um nome de aplicativo válido, em uma única linha.")
	for (const key of ["prep-cmd", "state-cmd", "detached"])
		if (!Array.isArray(draft[key])) throw new Error(`A lista ${key} é inválida.`)
	for (const key of ["prep-cmd", "state-cmd"])
		for (const row of draft[key] as unknown[]) object(row)
	if (!Number.isFinite(Number(draft["exit-timeout"])) || Number(draft["exit-timeout"]) < 0)
		throw new Error("O tempo de encerramento deve ser um número não negativo.")
	if (
		!Number.isFinite(Number(draft["scale-factor"])) ||
		Number(draft["scale-factor"]) < 20 ||
		Number(draft["scale-factor"]) > 200
	)
		throw new Error("A escala deve ficar entre 20% e 200%.")
	return {
		...draft,
		"exit-timeout": Number(draft["exit-timeout"]),
		"scale-factor": Number(draft["scale-factor"]),
		name: text(draft.name).trim()
	}
}
export function launcherFile(app: Document, hostUuid: string, hostName: string) {
	const line = (value: string) => value.replace(/[\r\n]/g, " ")
	return `# Artemis app entry\n# Exported by Apollo\n\n[host_uuid] ${line(hostUuid)}\n[host_name] ${line(hostName)}\n[app_uuid] ${line(text(app.uuid))}\n[app_name] ${line(text(app.name))}\n`
}
export function launchLink(app: Document, hostUuid: string, hostName: string) {
	return `art://launch?${new URLSearchParams({ host_uuid: hostUuid, host_name: hostName, app_uuid: text(app.uuid), app_name: text(app.name) })}`
}
