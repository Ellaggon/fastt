import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	buildProviderTrustMap,
	summarizeProviderTrustProgress,
	type BuildProviderTrustMapInput,
	type TrustLinkId,
} from "@/lib/provider-trust-map"
import { resolveVerificationTrustPanelFromUrl } from "@/lib/provider-verification-workspace"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

type Expected = {
	states: Partial<Record<TrustLinkId, string>>
	ready: number
	inReview: number
	actionRequired: number
	notStarted: number
	nextActionId: TrustLinkId | null
}

function expectScenario(input: BuildProviderTrustMapInput, expected: Expected) {
	const links = buildProviderTrustMap(input)
	const progress = summarizeProviderTrustProgress(links)

	for (const [id, state] of Object.entries(expected.states)) {
		expect(links.find((link) => link.id === id)?.uiState).toBe(state)
	}
	expect(progress.readyCount).toBe(expected.ready)
	expect(progress.inReviewCount).toBe(expected.inReview)
	expect(progress.actionRequiredCount).toBe(expected.actionRequired)
	expect(progress.notStartedCount).toBe(expected.notStarted)
	expect(progress.nextActionId).toBe(expected.nextActionId)
	expect(progress.readinessPercent).toBe(Math.round((expected.ready / 4) * 100))
	// The only completion state is `ready`; review is never credited as completed.
	expect(progress.readyCount).toBe(links.filter((link) => link.uiState === "ready").length)
}

describe("Fase 4 — certificación de Verificación", () => {
	it("1. provider nuevo: sin solicitud de identidad permanece sin iniciar", () => {
		expectScenario(
			{ accountStatus: null, documentsComplete: false, hasMissingDocs: false },
			{
				states: { identity: "not_started", business: "not_started" },
				ready: 0,
				inReview: 0,
				actionRequired: 0,
				notStarted: 4,
				nextActionId: "identity",
			}
		)
	})

	it("2. identidad incompleta requiere perfil sin contarla como lista", () => {
		expectScenario(
			{
				accountStatus: null,
				legalNameComplete: false,
				documentsComplete: false,
				hasMissingDocs: false,
			},
			{
				states: { identity: "action_needed", business: "not_started" },
				ready: 0,
				inReview: 0,
				actionRequired: 1,
				notStarted: 3,
				nextActionId: "identity",
			}
		)
	})

	it("3. identidad enviada permite continuar con Negocio", () => {
		expectScenario(
			{ accountStatus: "pending", documentsComplete: false, hasMissingDocs: true },
			{
				states: { identity: "in_review", business: "action_needed" },
				ready: 0,
				inReview: 1,
				actionRequired: 1,
				notStarted: 2,
				nextActionId: "business",
			}
		)
	})

	it("4. identidad aprobada aporta un único requisito listo", () => {
		expectScenario(
			{ accountStatus: "approved", documentsComplete: false, hasMissingDocs: true },
			{
				states: { identity: "ready", business: "action_needed" },
				ready: 1,
				inReview: 0,
				actionRequired: 1,
				notStarted: 2,
				nextActionId: "business",
			}
		)
	})

	it("5. documentos enviados quedan en revisión sin sumar progreso", () => {
		expectScenario(
			{
				accountStatus: "approved",
				documentsComplete: false,
				hasSubmittedDocs: true,
				hasMissingDocs: false,
			},
			{
				states: { identity: "ready", business: "in_review" },
				ready: 1,
				inReview: 1,
				actionRequired: 0,
				notStarted: 2,
				nextActionId: "fiscal",
			}
		)
	})

	it("5b. un documento enviado con otros faltantes sigue en revisión en el rail", () => {
		expectScenario(
			{
				accountStatus: "approved",
				documentsComplete: false,
				hasSubmittedDocs: true,
				hasMissingDocs: true,
			},
			{
				states: { identity: "ready", business: "in_review" },
				ready: 1,
				inReview: 1,
				actionRequired: 0,
				notStarted: 2,
				nextActionId: "fiscal",
			}
		)
	})

	it("6. documento rechazado usa requires_changes, no estado de espera", () => {
		expectScenario(
			{
				accountStatus: "approved",
				documentsComplete: false,
				hasRejectedDocs: true,
				hasMissingDocs: false,
			},
			{
				states: { identity: "ready", business: "requires_changes" },
				ready: 1,
				inReview: 0,
				actionRequired: 1,
				notStarted: 2,
				nextActionId: "business",
			}
		)
	})

	it("7. fiscal en revisión queda separado de los requisitos aprobados", () => {
		expectScenario(
			{ accountStatus: "approved", documentsComplete: true, fiscalStatus: "pending" },
			{
				states: { identity: "ready", business: "ready", fiscal: "in_review" },
				ready: 2,
				inReview: 1,
				actionRequired: 0,
				notStarted: 1,
				nextActionId: "payments",
			}
		)
	})

	it("7b. identidad fiscal guardada en revisión aunque el status aún diga not_configured", () => {
		expectScenario(
			{
				accountStatus: "approved",
				documentsComplete: true,
				fiscalStatus: "not_configured",
				fiscalIdentityInReview: true,
			},
			{
				states: { fiscal: "in_review" },
				ready: 2,
				inReview: 1,
				actionRequired: 0,
				notStarted: 1,
				nextActionId: "payments",
			}
		)
	})

	it("8. cuenta de pago en revisión queda separada de los requisitos aprobados", () => {
		expectScenario(
			{
				accountStatus: "approved",
				documentsComplete: true,
				fiscalStatus: "verified",
				pendingPaymentAccounts: 1,
			},
			{
				states: { payments: "in_review" },
				ready: 3,
				inReview: 1,
				actionRequired: 0,
				notStarted: 0,
				nextActionId: "payments",
			}
		)
	})

	it("9. las cuatro áreas listas alcanzan 100% y no recomiendan otra acción", () => {
		expectScenario(
			{
				accountStatus: "approved",
				documentsComplete: true,
				fiscalStatus: "verified",
				verifiedPaymentAccounts: 1,
			},
			{
				states: {
					identity: "ready",
					business: "ready",
					fiscal: "ready",
					payments: "ready",
				},
				ready: 4,
				inReview: 0,
				actionRequired: 0,
				notStarted: 0,
				nextActionId: null,
			}
		)
	})

	it("10. las rutas directas activan Fiscal y Pagos, sin recalcular progreso", () => {
		expect(
			resolveVerificationTrustPanelFromUrl(
				new URL("https://fastt.test/provider/settings/verification/fiscal")
			)
		).toBe("fiscal")
		expect(
			resolveVerificationTrustPanelFromUrl(
				new URL("https://fastt.test/provider/settings/verification/payments")
			)
		).toBe("payments")
	})

	it("11. el encabezado, rail y paneles preservan accesibilidad y adaptación móvil", () => {
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const rail = read("src/components/provider/ProviderTrustMapRail.astro")
		const tabs = read("src/components/ui/TabsInsidePanel.astro")
		const workspace = read("src/components/provider/ProviderVerificationWorkspace.astro")
		const styles = read("src/styles/global.css")

		expect(layout).toContain("aria-valuenow={rawPercent}")
		expect(layout).toContain("width: ${visualProgressPercent}%")
		expect(layout).not.toContain("stepPositionPercent")
		expect(layout).toContain("verification-wizard-progress-label")
		expect(tabs).toContain("overflow-x-auto")
		expect(rail).toContain('aria-current={active ? "page" : undefined}')
		expect(rail).not.toContain("Siguiente")
		expect(rail).toContain("darkError")
		expect(workspace).toContain('aria-labelledby="verification-panel-identity-title"')
		expect(workspace).toContain('aria-labelledby="verification-panel-business-title"')
		expect(workspace).toContain('aria-labelledby="verification-panel-fiscal-title"')
		expect(workspace).toContain('aria-labelledby="verification-panel-payments-title"')
		expect(styles).toContain('data-trust-link-status-state="in_review"')
	})
})
