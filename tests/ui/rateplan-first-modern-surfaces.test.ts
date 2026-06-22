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

	it("crear tarifas completa oferta, precio y contrato sin mezclar reglas al editar", () => {
		const manage = read("src/pages/rates/plans/manage.astro")
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")
		const createEndpoint = read("src/pages/api/rateplans/create.ts")
		const updateRepository = read(
			"src/modules/pricing/infrastructure/repositories/RatePlanCommandRepository.ts"
		)
		const presets = read("src/lib/rates/ratePlanIntentPresets.ts")

		expect(presets).toContain("Tarifa flexible")
		expect(presets).toContain("No reembolsable")
		expect(presets).toContain("Estadía larga")
		expect(presets).toContain("Anticipada")
		expect(manage).toContain("data-rate-plan-create-form")
		expect(manage).toContain("Precio base por noche")
		expect(manage).toContain("Guardar borrador")
		expect(manage).toContain("Publicar")
		expect(manage).not.toContain("Nombre del plan")
		expect(detail).toContain("Editar datos de tarifa")
		expect(detail).not.toContain("Editar intención de tarifa")
		expect(createEndpoint).toContain("requireProvider")
		expect(createEndpoint).toContain("setRatePlanPricingBaseline")
		expect(createEndpoint).toContain("createRatePlanContract")
		expect(updateRepository).not.toContain(
			'await deleteCommercialRulesForScope({ scope: "rate_plan", scopeId: params.ratePlanId })'
		)
	})

	it("filtra estados de tarifas sin volver a cargar lecturas comerciales", () => {
		const manage = read("src/pages/rates/plans/manage.astro")

		expect(manage).toContain("data-rate-plan-tab")
		expect(manage).toContain("data-rate-plan-row")
		expect(manage).toContain("renderRatePlanView")
		expect(manage).toContain("window.history.pushState")
		expect(manage).toContain("event.preventDefault()")
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
		const assignmentOptions = read("src/pages/api/policies/assignment-options.ts")
		const presets = read("src/data/policy/policy-presets.ts")
		const criticalRoutes = read("src/lib/dashboard-critical-routes.ts")

		expect(existsSync(resolve(process.cwd(), "src/pages/provider/policies/index.astro"))).toBe(
			false
		)
		expect(existsSync(resolve(process.cwd(), "src/components/policy/PolicyBuilder.astro"))).toBe(
			false
		)
		expect(criticalRoutes).not.toContain("/provider/policies")
		expect(assignmentOptions).not.toContain("strict_legacy")
		expect(assignmentOptions).not.toContain("heredada")
		expect(presets).toContain('key: "strict"')
		expect(presets).not.toContain('key: "strict_legacy"')
		expect(presets).not.toContain("Estricta heredada")
	})

	it("condiciones se operan dentro de tarifa y Multicalendario", () => {
		const assignmentFlow = read("src/components/policy/PolicyAssignmentFlow.astro")
		const ratePlanSurface = read("src/components/policy/RatePlanPoliciesSurface.astro")
		const multiCalendar = read("src/components/rates/MultiCalendarWorkspace.tsx")

		expect(ratePlanSurface).toContain("Contrato base")
		expect(ratePlanSurface).toContain("Elegir plantilla")
		expect(ratePlanSurface).toContain("Cambiar")
		expect(ratePlanSurface).not.toContain("/provider/policies")
		expect(multiCalendar).toContain('activeTab === "conditions"')
		expect(multiCalendar).toContain("policy-assignment-open")
		expect(multiCalendar).toContain("Editar contrato")
		expect(assignmentFlow).toContain("defaultChannel")
		expect(assignmentFlow).toContain("channelSelect.value = defaultChannel")
	})

	it("asignacion contextual usa preview obligatorio del backend", () => {
		const assignmentFlow = read("src/components/policy/PolicyAssignmentFlow.astro")
		const previewEndpoint = read("src/pages/api/policies/preview.ts")

		expect(assignmentFlow).toContain('fetch("/api/policies/preview"')
		expect(assignmentFlow).toContain("assignmentState.previewReady")
		expect(assignmentFlow).toContain("Calcula y revisa el preview obligatorio")
		expect(previewEndpoint).toContain('mode?: "existing" | "preset" | "draft"')
		expect(previewEndpoint).toContain("loadDraftPolicy")
	})

	it("preview financiero completo es unico para asignacion, quote y cancelacion", () => {
		const assignmentFlow = read("src/components/policy/PolicyAssignmentFlow.astro")
		const previewEndpoint = read("src/pages/api/policies/preview.ts")
		const quoteEndpoint = read("src/pages/api/internal/financial/refund-quotes.ts")
		const cancelEndpoint = read("src/pages/api/booking/cancel.ts")
		const financialPreview = read(
			"src/modules/financial/application/use-cases/build-policy-financial-preview.ts"
		)

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

	it("tarifa presenta el contrato en lenguaje humano y reserva trazabilidad para detalle", () => {
		const surface = read("src/components/policy/RatePlanPoliciesSurface.astro")
		const useCase = read("src/modules/policies/application/use-cases/rate-plan-policies-surface.ts")
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")

		expect(surface).toContain("data-contract-sellability")
		expect(surface).toContain("Contrato completo")
		expect(surface).toContain("Falta completar")
		expect(surface).toContain("Contrato aplicable")
		expect(surface).toContain("Heredada de")
		expect(surface).toContain("Detalle técnico y versiones")
		expect(surface).toContain("Snapshot preview")
		expect(surface).toContain("snapshotVersionIds")
		expect(surface).toContain("Configurar hotel")
		expect(surface).toContain("Elegir plantilla")
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
