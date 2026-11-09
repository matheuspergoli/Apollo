// In-memory UX model only. No host transport, executable code evaluation or persistence.
export const scriptLimit = 128 * 1024
export const slots = ["launch", "prepare", "undo"] as const
export type Slot = (typeof slots)[number]
export const slotNames: Record<Slot, string> = {
	launch: "Inicialização",
	prepare: "Preparação",
	undo: "Desfazer preparação"
}

export type ScriptFile = {
	name: string
	bytes: Uint8Array
	text: string
	sha256: string
}
export type Revision = ScriptFile & { number: number; available: boolean }
export type Resource = {
	id: string
	name: string
	revisions: Revision[]
	provisional?: boolean
}
export type CommandDraft = {
	source: "manual" | "script"
	manual: string
	resourceId: string
	revision: number
	args: string[]
}
export type Application = {
	uuid: string
	name: string
	elevated: boolean
	preparationElevated: boolean
	commands: Record<Slot, CommandDraft>
}
export type PrototypeState = {
	resources: Resource[]
	saved: Application
	draft: Application
	other: Application
	version: number
	baseVersion: number
}
export type Scenario = "success" | "conflict" | "expired" | "unconfirmed"

export function manualCommand(manual = ""): CommandDraft {
	return { source: "manual", manual, resourceId: "", revision: 0, args: [] }
}

export async function inspectScript(name: string, input: Uint8Array): Promise<ScriptFile> {
	if (!name.toLowerCase().endsWith(".ps1") || /[/\\\0\r\n]/.test(name) || name.length > 180)
		throw new Error("Selecione um script PowerShell .ps1 com um nome simples.")
	if (!input.length || input.length > scriptLimit)
		throw new Error("Selecione um script não vazio de até 128 KiB para este protótipo.")
	const bytes = new Uint8Array(input)
	let text: string
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		throw new Error("Este protótipo aceita UTF-8. O arquivo original não foi alterado.")
	}
	if (text.includes("\0")) throw new Error("O script contém um caractere nulo inválido.")
	const digest = await crypto.subtle.digest("SHA-256", bytes)
	const sha256 = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("")
	return { name, bytes, text, sha256 }
}

export function revisionFor(resources: Resource[], command: CommandDraft) {
	return resources
		.find((resource) => resource.id === command.resourceId)
		?.revisions.find((revision) => revision.number === command.revision)
}

export function validateDraft(state: PrototypeState) {
	if (!state.draft.name.trim()) throw new Error("Preencha o nome do aplicativo.")
	for (const slot of slots) {
		const command = state.draft.commands[slot]
		if (command.source !== "script") continue
		const revision = revisionFor(state.resources, command)
		if (!revision?.available)
			throw new Error(`${slotNames[slot]}: selecione uma revisão disponível do script.`)
		if (
			command.args.length > 16 ||
			command.args.some((arg) => arg.length > 1024 || /[\0\r\n]/.test(arg))
		)
			throw new Error(
				`${slotNames[slot]}: use até 16 argumentos de uma linha e até 1024 caracteres cada.`
			)
	}
}

export function draftChanged(state: PrototypeState) {
	return JSON.stringify(state.draft) !== JSON.stringify(state.saved)
}

export function discardDraft(state: PrototypeState): PrototypeState {
	return {
		...state,
		draft: structuredClone(state.saved),
		baseVersion: state.version,
		resources: state.resources.filter((resource) => !resource.provisional)
	}
}

export function resourceUses(state: PrototypeState, id: string) {
	return [state.saved, state.other].flatMap((app) =>
		slots
			.filter(
				(slot) =>
					app.commands[slot].source === "script" && app.commands[slot].resourceId === id
			)
			.map((slot) => ({
				uuid: app.uuid,
				app: app.name,
				slot,
				revision: app.commands[slot].revision
			}))
	)
}

export function addScript(
	state: PrototypeState,
	file: ScriptFile,
	targetId?: string
): PrototypeState {
	const target = targetId
		? state.resources.find((resource) => resource.id === targetId)
		: undefined
	if (targetId && !target)
		throw new Error("O recurso não está mais disponível. Revise a biblioteca.")
	if ((!target && state.resources.length >= 32) || (target && target.revisions.length >= 16))
		throw new Error("Limite da amostra: até 32 recursos e 16 revisões por recurso.")
	if (target?.revisions.some((revision) => revision.sha256 === file.sha256))
		throw new Error("Esse conteúdo já existe neste recurso. Nenhuma revisão foi criada.")
	const revision: Revision = {
		...file,
		bytes: new Uint8Array(file.bytes),
		number: target ? Math.max(...target.revisions.map((item) => item.number)) + 1 : 1,
		available: true
	}
	if (target)
		return {
			...state,
			resources: state.resources.map((resource) =>
				resource.id === target.id
					? { ...resource, revisions: [...resource.revisions, revision] }
					: resource
			)
		}
	return {
		...state,
		resources: [
			...state.resources,
			{
				id: crypto.randomUUID(),
				name: file.name,
				revisions: [revision]
			}
		]
	}
}

export function removeResource(state: PrototypeState, id: string): PrototypeState {
	const draftUses = slots.some(
		(slot) =>
			state.draft.commands[slot].source === "script" &&
			state.draft.commands[slot].resourceId === id
	)
	if (resourceUses(state, id).length || draftUses)
		throw new Error(
			"Este recurso tem vínculos salvos ou no rascunho. Remova os vínculos antes de excluir."
		)
	return { ...state, resources: state.resources.filter((resource) => resource.id !== id) }
}

export function saveSimulation(state: PrototypeState, scenario: Scenario): PrototypeState {
	validateDraft(state)
	if (scenario === "expired")
		throw new Error("Sessão expirada na simulação. Revalide a sessão; o rascunho foi mantido.")
	if (scenario === "conflict" || state.version !== state.baseVersion)
		throw new Error(
			"Conflito na simulação. Consulte a versão salva antes de reaplicar seu rascunho."
		)
	return {
		...state,
		resources: state.resources
			.filter(
				(resource) =>
					!resource.provisional ||
					slots.some(
						(slot) =>
							state.draft.commands[slot].source === "script" &&
							state.draft.commands[slot].resourceId === resource.id
					)
			)
			.map((resource) => ({ ...resource, provisional: false })),
		saved: structuredClone(state.draft),
		version: state.version + 1,
		baseVersion: scenario === "unconfirmed" ? state.baseVersion : state.version + 1
	}
}

export type DemoPackage = {
	name: string
	scripts: ScriptFile[]
	dependency: string
}

export async function examplePackage(): Promise<DemoPackage> {
	return {
		name: "Aplicativo importado",
		scripts: [
			await inspectScript(
				"Preparar exemplo.ps1",
				new TextEncoder().encode(
					'# Exemplo para leitura. Não é executado pelo protótipo.\r\nWrite-Output "Exemplo"\r\n'
				)
			)
		],
		dependency: "Executável do aplicativo: informe o caminho no host após revisar o pacote."
	}
}

export function applyPackage(state: PrototypeState, bundle: DemoPackage): PrototypeState {
	// Preview-only resources stay in memory; no host files or saved applications are touched.
	if (!bundle.scripts.length) throw new Error("O exemplo de pacote não contém scripts.")
	if (state.resources.length + bundle.scripts.length > 32)
		throw new Error("Limite da amostra: até 32 recursos.")
	const imported: Resource[] = bundle.scripts.map((file) => ({
		id: crypto.randomUUID(),
		name: file.name,
		provisional: true,
		revisions: [{ ...file, bytes: new Uint8Array(file.bytes), number: 1, available: true }]
	}))
	const prepare = imported[0]
	return {
		...state,
		resources: [...state.resources, ...imported],
		draft: {
			...state.draft,
			name: bundle.name,
			commands: {
				...state.draft.commands,
				prepare: {
					...state.draft.commands.prepare,
					source: "script",
					resourceId: prepare.id,
					revision: 1,
					args: []
				}
			}
		}
	}
}

export async function createPrototypeState(): Promise<PrototypeState> {
	const file = await inspectScript(
		"Preparar ambiente.ps1",
		new TextEncoder().encode(
			'# Amostra de interface; este código nunca é executado aqui.\nWrite-Output "Preparar ambiente"\n'
		)
	)
	const resource: Resource = {
		id: "sample-script",
		name: file.name,
		revisions: [{ ...file, number: 1, available: true }]
	}
	const saved: Application = {
		uuid: "sample-app",
		name: "Aplicativo de exemplo",
		elevated: false,
		preparationElevated: false,
		commands: {
			launch: manualCommand("example-launcher.exe"),
			prepare: manualCommand(),
			undo: manualCommand()
		}
	}
	const other = structuredClone(saved)
	other.uuid = "other-sample-app"
	other.name = "Outro aplicativo de exemplo"
	other.commands.prepare = {
		...manualCommand(),
		source: "script",
		resourceId: resource.id,
		revision: 1
	}
	return {
		resources: [resource],
		saved,
		draft: structuredClone(saved),
		other,
		version: 1,
		baseVersion: 1
	}
}
