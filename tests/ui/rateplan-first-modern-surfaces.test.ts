import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/rateplan-first modern surfaces", () => {
	it("precio base vive en la ficha de tarifa, no en una pagina paralela de pricing", () => {
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")
		expect(
			existsSync(resolve(process.cwd(), "src/pages/rates/plans/[ratePlanId]/pricing.astro"))
		).toBe(false)
		expect(detail).toContain("<RatePlanPricingSurface")
		expect(detail).toContain("Editar precio base")
		expect(detail).toContain("ratePlanId={String(row.ratePlanId)}")
		expect(detail).not.toContain("routes.ratePlanPricing")
	})

	it("crear y editar tarifas empieza por intención humana", () => {
		const manage = read("src/pages/rates/plans/manage.astro")
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")
		const presets = read("src/lib/rates/ratePlanIntentPresets.ts")

		expect(presets).toContain("Tarifa flexible")
		expect(presets).toContain("No reembolsable")
		expect(presets).toContain("Estadía larga")
		expect(presets).toContain("Anticipada")
		expect(manage).toContain("Elige una intención comercial")
		expect(manage).toContain("data-rate-plan-intent-form")
		expect(manage).toContain("data-rate-plan-intent-card")
		expect(manage).not.toContain("Nombre del plan")
		expect(detail).toContain("Editar intención de tarifa")
		expect(detail).toContain("data-rate-plan-intent-edit-form")
		expect(detail).toContain("El precio base se edita aparte")
	})

	it("pricing surface moderna envía solo ratePlanId", () => {
		const source = read("src/components/pricing/RatePlanPricingSurface.astro")
		expect(source).toContain('<Input type="hidden" name="ratePlanId" value={ratePlanId} />')
		expect(source).not.toContain('name="variantId"')
	})

	it("policies page moderna no inyecta variantId en el use-case POST", () => {
		const source = read("src/pages/rates/plans/[ratePlanId]/policies.astro")
		expect(source).toContain("handleRatePlanPoliciesPost({")
		expect(source).toContain("ratePlans: selectedRatePlans")
		expect(source).not.toContain("expectedOwnerContext")
		expect(source).not.toContain("variantId: ownerContext.variantId")
	})

	it("condiciones de tarifa solo permite usar existente o crear desde plantilla", () => {
		const source = read("src/components/policy/RatePlanPoliciesSurface.astro")

		expect(source).toContain("Usar condición existente")
		expect(source).toContain("Crear desde plantilla")
		expect(source).toContain('data-assignment-mode="existing"')
		expect(source).toContain('data-assignment-mode="preset"')
		expect(source).toContain("<PolicyAssignmentFlow")
		expect(source).not.toContain("policyWizardOverlay")
		expect(source).not.toContain("wizCategoryForm")
		expect(source).not.toContain('intent: "save_category"')
		expect(source).not.toContain("daysBeforeArrival")
		expect(source).not.toContain("paymentMode")
	})

	it("preview de asignacion de condiciones usa backend real obligatorio", () => {
		const source = read("src/components/policy/PolicyAssignmentFlow.astro")
		const endpoint = read("src/pages/api/policies/preview.ts")
		const financialPreview = read(
			"src/modules/financial/application/use-cases/build-policy-financial-preview.ts"
		)

		expect(source).toContain('fetch("/api/policies/preview"')
		expect(source).toContain("assignmentState.previewReady")
		expect(source).toContain("Calcula y revisa el preview obligatorio antes de confirmar")
		expect(source).not.toContain("renderAirbnbPreview")
		expect(source).not.toContain("penaltyAtDays")
		expect(source).not.toContain("refundTextFromPenalty")
		expect(endpoint).toContain("buildPolicyFinancialPreviewFromResolution")
		expect(financialPreview).toContain("buildPolicySnapshot")
		expect(financialPreview).toContain("buildRefundQuote")
		expect(financialPreview).toContain('key: "cancel_today"')
		expect(financialPreview).toContain('key: "cancel_7_days"')
		expect(financialPreview).toContain('key: "long_stay_28"')
		expect(financialPreview).toContain('key: "taxes_fees"')
		expect(financialPreview).toContain('key: "provider_payout"')
		expect(financialPreview).toContain('key: "no_show"')
		expect(financialPreview).toContain('key: "payment_due"')
	})

	it("pagina publica muestra condiciones junto a cada tarifa reservable", () => {
		const hotelPage = read("src/pages/hotels/[id]/index.astro")
		const roomSection = read("src/components/productUI/RoomSection.astro")
		const roomModal = read("src/components/productUI/RoomModal.astro")

		expect(hotelPage).toContain("policiesByRatePlanId")
		expect(hotelPage).toContain("requiredCategories: policyCategories")
		expect(hotelPage).toContain("La verdad contractual se muestra junto a cada")
		expect(roomSection).toContain("Verdad contractual de esta tarifa")
		expect(roomSection).toContain("data-select-rateplan-id")
		expect(roomSection).toContain("ratePlanId,")
		expect(roomSection).toContain("occupancyDetail")
		expect(roomSection).not.toContain("Condiciones asignadas a esta tarifa")
		expect(roomModal).toContain("Verdad contractual de esta tarifa")
		expect(roomModal).toContain("data-select-rateplan-id")
	})

	it("overrides admin usa RBAC central, scope real, evidencia e impacto", () => {
		const page = read("src/pages/admin/policy-exceptions.astro")
		const createEndpoint = read("src/pages/api/internal/policies/exceptions.ts")
		const updateEndpoint = read("src/pages/api/internal/policies/exceptions/[id].ts")
		const container = read("src/container/policy-exceptions.container.ts")

		expect(page).toContain("requireInternalAdmin")
		expect(page).toContain('name="scopeTarget"')
		expect(page).toContain("Evidencia obligatoria")
		expect(page).toContain("Buscador soporte/admin")
		expect(page).toContain("data-policy-exception-search")
		expect(page).toContain("Impacto previsto")
		expect(page).toContain("data-impact-guest")
		expect(page).toContain("Antes / después")
		expect(page).toContain("Aprobar")
		expect(page).toContain("Rollback")
		expect(page).toContain("data-exception-operation")
		expect(page).not.toContain("ADMIN_EMAILS")
		expect(createEndpoint).toContain("requireInternalAdmin")
		expect(createEndpoint).toContain("scopeTarget")
		expect(createEndpoint).toContain("impact_required")
		expect(createEndpoint).toContain("evidence_required")
		expect(createEndpoint).toContain("evidenceAttachments")
		expect(createEndpoint).toContain("effectiveFrom")
		expect(createEndpoint).toContain("note: z.string().trim().min(8)")
		expect(updateEndpoint).toContain("requireInternalAdmin")
		expect(updateEndpoint).toContain("approvePolicyExceptionRuleUseCase")
		expect(updateEndpoint).toContain("rollbackPolicyExceptionRuleUseCase")
		expect(updateEndpoint).toContain('operation === "rollback"')
		expect(updateEndpoint).not.toContain("ADMIN_EMAILS")
		expect(container).toContain("policy_exception_approved")
		expect(container).toContain("policy_exception_rolled_back")
		expect(container).toContain("before")
		expect(container).toContain("after")
	})

	it("no existen superficies legacy variant-first de pricing", () => {
		const pages = [
			"src/pages/product/[id]/variants/[variantId]/pricing/index.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/calendar.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/seasons.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/promotions.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/overrides.astro",
			"src/pages/product/[id]/variants/[variantId]/pricing/rateplans.astro",
		]
		for (const page of pages) {
			expect(existsSync(resolve(process.cwd(), page))).toBe(false)
		}
	})

	it("condiciones no expone rutas ni presets legacy visibles", () => {
		const policyBuilder = read("src/components/policy/PolicyBuilder.astro")
		const policyIndex = read("src/pages/provider/policies/index.astro")
		const assignmentOptions = read("src/pages/api/policies/assignment-options.ts")
		const presets = read("src/data/policy/policy-presets.ts")
		const criticalRoutes = read("src/lib/dashboard-critical-routes.ts")

		expect(existsSync(resolve(process.cwd(), "src/pages/provider/policies/rate-plans.astro"))).toBe(
			false
		)
		expect(criticalRoutes).not.toContain("/provider/policies/rate-plans")
		expect(policyBuilder).not.toContain("strict_legacy")
		expect(policyBuilder).not.toContain("heredada")
		expect(policyIndex).not.toContain("strict_legacy")
		expect(policyIndex).not.toContain("heredada")
		expect(assignmentOptions).not.toContain("strict_legacy")
		expect(assignmentOptions).not.toContain("heredada")
		expect(presets).toContain('key: "strict"')
		expect(presets).not.toContain('key: "strict_legacy"')
		expect(presets).not.toContain("Estricta heredada")
	})

	it("condiciones es centro operativo matriz primero y biblioteca secundaria despues", () => {
		const policyIndex = read("src/pages/provider/policies/index.astro")
		const assignmentFlow = read("src/components/policy/PolicyAssignmentFlow.astro")

		expect(policyIndex).toContain("data-policy-operations-matrix")
		expect(policyIndex).toContain("Tarifas/listings/canales vs condiciones")
		expect(policyIndex).toContain("Centro operativo")
		expect(policyIndex).toContain("Cancelación")
		expect(policyIndex).toContain("Pago")
		expect(policyIndex).toContain("No presentación")
		expect(policyIndex).toContain("Ingreso/salida")
		expect(policyIndex).toContain("data-policy-library-secondary")
		expect(policyIndex).toContain("Biblioteca secundaria")
		expect(policyIndex.indexOf("data-policy-operations-matrix")).toBeLessThan(
			policyIndex.indexOf("data-policy-library-secondary")
		)
		expect(policyIndex).toContain("data-assignment-channel")
		expect(assignmentFlow).toContain("defaultChannel")
		expect(assignmentFlow).toContain("channelSelect.value = defaultChannel")
	})

	it("builder de condiciones es wizard real y preview viene del backend", () => {
		const policyBuilder = read("src/components/policy/PolicyBuilder.astro")
		const previewEndpoint = read("src/pages/api/policies/preview.ts")

		expect(policyBuilder).toContain("data-policy-builder-steps")
		expect(policyBuilder).toContain('data-wizard-panel="0"')
		expect(policyBuilder).toContain('data-wizard-panel="1"')
		expect(policyBuilder).toContain('data-wizard-panel="2"')
		expect(policyBuilder).toContain('data-wizard-panel="3"')
		expect(policyBuilder).toContain('fetch("/api/policies/preview"')
		expect(policyBuilder).toContain('mode: "draft"')
		expect(policyBuilder).toContain("previewReady")
		expect(policyBuilder).toContain("Preview backend obligatorio")
		expect(policyBuilder).toContain("Avanzado técnico")
		expect(policyBuilder).not.toContain("Excepciones legales JSON")
		expect(policyBuilder).not.toContain("penaltyAtDays")
		expect(policyBuilder).not.toContain("refundFromPenalty")
		expect(previewEndpoint).toContain('mode?: "existing" | "preset" | "draft"')
		expect(previewEndpoint).toContain("loadDraftPolicy")
	})

	it("preview financiero completo es unico para builder, asignacion, quote y cancelacion", () => {
		const policyBuilder = read("src/components/policy/PolicyBuilder.astro")
		const assignmentFlow = read("src/components/policy/PolicyAssignmentFlow.astro")
		const previewEndpoint = read("src/pages/api/policies/preview.ts")
		const quoteEndpoint = read("src/pages/api/internal/financial/refund-quotes.ts")
		const cancelEndpoint = read("src/pages/api/booking/cancel.ts")
		const financialPreview = read(
			"src/modules/financial/application/use-cases/build-policy-financial-preview.ts"
		)

		expect(policyBuilder).toContain('fetch("/api/policies/preview"')
		expect(assignmentFlow).toContain('fetch("/api/policies/preview"')
		expect(previewEndpoint).toContain("buildPolicyFinancialPreviewFromResolution")
		expect(quoteEndpoint).toContain("buildPolicyFinancialPreviewFromSnapshot")
		expect(quoteEndpoint).toContain("financialPreview")
		expect(cancelEndpoint).toContain("buildPolicyFinancialPreviewFromSnapshot")
		expect(cancelEndpoint).toContain("financialPreview")
		for (const key of [
			"cancel_today",
			"cancel_7_days",
			"long_stay_28",
			"taxes_fees",
			"provider_payout",
			"no_show",
			"payment_due",
		]) {
			expect(financialPreview).toContain(`key: "${key}"`)
		}
	})

	it("tarifa muestra condiciones como contrato vendible con snapshot y overrides", () => {
		const surface = read("src/components/policy/RatePlanPoliciesSurface.astro")
		const useCase = read("src/modules/policies/application/use-cases/rate-plan-policies-surface.ts")
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")

		expect(surface).toContain("data-contract-sellability")
		expect(surface).toContain("No lista para vender")
		expect(surface).toContain("Contrato aplicable")
		expect(surface).toContain("Herencia:")
		expect(surface).toContain("Override:")
		expect(surface).toContain("Snapshot:")
		expect(surface).toContain("Snapshot preview")
		expect(surface).toContain("snapshotVersionIds")
		expect(useCase).toContain("buildPolicySnapshot")
		expect(useCase).toContain("PolicyExceptionRuleRepository")
		expect(useCase).toContain("inheritanceByCategory")
		expect(useCase).toContain("overrideSummaryByCategory")
		expect(useCase).toContain("snapshotPreviewByCategory")
		expect(useCase).toContain("sellabilityBlockers")
		expect(detail).toContain("data-rate-plan-contract-lock")
		expect(detail).toContain("Tarifa no lista para vender")
		expect(detail).toContain("Revisar contrato de tarifa")
	})
})
