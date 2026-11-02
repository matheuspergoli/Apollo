import { describe, expect, it } from "vitest"
import { draftFrom, serializeSettings, snapshot } from "../settings/model"
import {
	parseWindowStatus,
	windowDiagnosticDescription,
	windowUnconfirmedDescription
} from "./window-management"

const status = {
	status: true,
	supported: true,
	manual_available: true,
	phase: "active",
	reason: "active",
	moved: 2,
	restored: 1,
	skipped: 3,
	failed: 0,
	overflow: 0,
	last_error: 0,
	generation: 1,
	recovery_required: false,
	diagnostics: {
		enumeration_failures: 0,
		inspection_failures: 0,
		submission_rejections: 0,
		confirmation_timeouts: 0,
		confirmation_rejections: 0,
		restoration_skips: 0,
		shutdown_unfinished: 0,
		target_failures: 0,
		timeouts_unobserved: 0,
		timeouts_state: 0,
		timeouts_position: 0,
		timeouts_destination: 0,
		last_operation: "none",
		last_reason: "none",
		last_observation: "none",
		last_stage: "none",
		unconfirmed_operation: "none",
		unconfirmed_reason: "none",
		unconfirmed_observation: "none",
		unconfirmed_state: "none",
		unconfirmed_stage: "none",
		unconfirmed_checks: 0,
		unconfirmed_error: 0
	},
	applications: [{ uuid: "12345678-abcd-4321-9876-1234567890ab", name: "Desktop" }]
}

describe("window management contracts", () => {
	it("uses reported counters and never fabricates missing or invalid values", () => {
		expect(parseWindowStatus(status).moved).toBe(2)
		for (const patch of [
			{ moved: undefined },
			{ failed: -1 },
			{ restored: "2" },
			{ phase: "unknown" },
			{ manual_available: "true" }
		])
			expect(() => parseWindowStatus({ ...status, ...patch })).toThrow()
	})
	it("rejects malformed diagnostics rather than inventing zero failures", () => {
		for (const diagnostics of [
			undefined,
			{ ...status.diagnostics, inspection_failures: -1 },
			{ ...status.diagnostics, confirmation_timeouts: "3" },
			{ ...status.diagnostics, last_operation: null },
			{ ...status.diagnostics, last_observation: false }
		])
			expect(() => parseWindowStatus({ ...status, diagnostics })).toThrow()
		for (const patch of [{ generation: undefined }, { recovery_required: "true" }])
			expect(() => parseWindowStatus({ ...status, ...patch })).toThrow()
	})
	it("retains the last unconfirmed operation separately from later inspection errors", () => {
		const parsed = parseWindowStatus({
			...status,
			last_error: 13,
			diagnostics: {
				...status.diagnostics,
				last_operation: "inspect",
				last_reason: "inspection_failed",
				last_stage: "normal_geometry",
				unconfirmed_operation: "confirm_move",
				unconfirmed_reason: "confirmation_timeout",
				unconfirmed_observation: "destination_mismatch",
				unconfirmed_state: "maximized",
				unconfirmed_checks: 2
			}
		})
		expect(windowDiagnosticDescription(parsed)).toContain("geometria da posição restaurada")
		expect(windowDiagnosticDescription(parsed)).toContain("Código Win32 13")
		expect(windowUnconfirmedDescription(parsed)).toContain("monitor diferente do destino")
		expect(windowUnconfirmedDescription(parsed)).toContain("Estado solicitado: maximizado")
		expect(windowUnconfirmedDescription(parsed)).toContain("Conferências executadas: 2")
		expect(windowUnconfirmedDescription(parsed)).not.toContain("Código Win32 13")
		for (const patch of [
			{ unconfirmed_checks: -1 },
			{ timeouts_position: "1" },
			{ unconfirmed_stage: null }
		])
			expect(() =>
				parseWindowStatus({ ...status, diagnostics: { ...status.diagnostics, ...patch } })
			).toThrow()
	})
	it("correlates the code with its operation and explains unconfirmed geometry without claiming movement", () => {
		const inspected = parseWindowStatus({
			...status,
			last_error: 13,
			diagnostics: {
				...status.diagnostics,
				last_operation: "inspect",
				last_reason: "inspection_failed"
			}
		})
		expect(windowDiagnosticDescription(inspected)).toContain("Inspeção de janela")
		expect(windowDiagnosticDescription(inspected)).toContain("Código Win32 13")
		const timedOut = parseWindowStatus({
			...status,
			diagnostics: {
				...status.diagnostics,
				last_operation: "confirm_move",
				last_reason: "confirmation_timeout",
				last_observation: "position_mismatch",
				confirmation_timeouts: 1
			}
		})
		expect(windowDiagnosticDescription(timedOut)).toContain("posição ou tamanho diferente")
		expect(windowDiagnosticDescription(timedOut)).toContain("Sem código Win32 associado")
	})
	it("does not expose manual recovery for unsupported or inactive sessions", () => {
		expect(parseWindowStatus({ ...status, supported: false }).manual_available).toBe(false)
		expect(parseWindowStatus({ ...status, phase: "paused" }).manual_available).toBe(false)
	})
	it("keeps defaults inactive without an explicit selection and validates values before saving", () => {
		const draft = draftFrom(snapshot({ status: true, platform: "windows" }))
		expect(draft.wsm_application_uuid).toBe("")
		expect(serializeSettings(draft)).toEqual({})
		for (const patch of [
			{ wsm_mode: "enabled" },
			{ wsm_application_uuid: "Desktop" },
			{ wsm_handle_new: "enable1" }
		])
			expect(() => serializeSettings({ ...draft, ...patch })).toThrow()
		expect(
			serializeSettings({
				...draft,
				wsm_mode: "disabled",
				wsm_application_uuid: status.applications[0].uuid
			})
		).toEqual({ wsm_mode: "disabled", wsm_application_uuid: status.applications[0].uuid })
	})
})
