import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/tours/operating-geography", () => ({
	readOperatingPlaces: async (ids: string[]) =>
		ids
			.filter((id) => ["geo:bo:la-paz-department", "geo:bo:oruro"].includes(id))
			.map((id) => ({ id, name: id.endsWith("oruro") ? "Oruro" : "La Paz", country: "BO" })),
}))
import ProviderTourOperatingContext from "@/components/provider/ProviderTourOperatingContext.astro"
import ProviderVerificationLineSections from "@/components/provider/ProviderVerificationLineSections.astro"
import type { VerificationScreen, VerificationScreenItem } from "@/lib/verification/screen-sections"

const request = new Request(
	"https://fastt.test/provider/settings/verification?line=tour&tab=activity&experience=tour-a&tourTab=activity"
)
const progress = {
	readyCount: 0,
	totalCount: 1,
	inReviewCount: 0,
	actionRequiredCount: 1,
	notStartedCount: 0,
	readinessPercent: 0,
}
function screen(items: VerificationScreenItem[]): VerificationScreen {
	return {
		sections: [
			{
				id: "tour",
				title: "Experiencia",
				description: "",
				items,
				progress,
				selling: progress,
				sellingNote: null,
			},
		],
		applicable: progress,
		paymentsCountsForSelling: false,
	}
}
const gap: VerificationScreenItem = {
	id: "tour.context_missing",
	label: "Actividad y territorio de la experiencia",
	state: "action_needed",
	stateLabel: "Completar",
	countsTowardProgress: true,
	presentationArea: "activity",
	href: "/provider/settings/verification?line=tour&tab=activity&experience=tour-a#tour-operating-context",
}
const license: VerificationScreenItem = {
	...gap,
	id: "tour.guide_credential",
	label: "Credencial de guía",
	href: "/provider/settings/verification/documents?type=operating_license",
}

describe("experience operation and applicable licenses", () => {
	it("requires explicit clarification of ambiguous historical services", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderTourOperatingContext, {
			request,
			props: {
				productId: "tour-a",
				canEdit: true,
				context: {
					operatingRole: "operator",
					jurisdictionCode: "geo:bo:la-paz-department",
					activityClassesJson: ["water_air", "transport", "gastronomic"],
				},
			},
		})
		expect(html).toMatch(/name="waterDecision"[^>]*required/)
		expect(html).toMatch(/name="airDecision"[^>]*required/)
		expect(html).toMatch(/name="legacyTransportDecision"[^>]*required/)
		expect(html).toContain("Confirma cómo participan los alimentos")
	})
	it("renders a normalized summary and separate water, air and transport controls", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderTourOperatingContext, {
			request,
			props: {
				productId: "tour-a",
				canEdit: true,
				context: {
					operatingRole: "operator",
					jurisdictionCode: "geo:bo:la-paz-department",
					activityClassesJson: ["urban_cultural"],
					revision: 2,
					operationJson: {
						version: 2,
						executionMode: "team",
						guidingService: false,
						characteristics: ["urban_cultural"],
						operatorResourceId: null,
						waterActivity: false,
						airActivity: false,
						foodHandling: "none",
						transportServices: [],
						resourceIds: [],
					},
				},
			},
		})
		expect(html).toContain("data-operation-saved-summary")
		expect(html).not.toContain("Aclara la operación guardada")
		expect(html).toContain('name="waterActivity"')
		expect(html).toContain('name="airActivity"')
		expect(html).toContain("data-transport-template")
		expect(html).toMatch(/name="revision"[^>]*value="2"/)
		expect(html).not.toMatch(/<details open[^>]*data-operation-editor/)
	})
	it("restores every department selected for the experience", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderTourOperatingContext, {
			request,
			props: {
				productId: "tour-a",
				canEdit: true,
				context: {
					operatingRole: "guide",
					jurisdictionCode: "geo:bo:la-paz-department",
					jurisdictionCodes: ["geo:bo:la-paz-department", "geo:bo:oruro"],
					activityClassesJson: ["urban_cultural"],
				},
			},
		})
		for (const code of ["geo:bo:la-paz-department", "geo:bo:oruro"])
			expect(html).toMatch(new RegExp(`name="jurisdictionCodes"[^>]*value="${code}"[^>]*checked`))
	})
	it.each([
		[false, "not_evaluable", "Completa la operación de la experiencia"],
		[true, "not_evaluable", "Requisitos por definir"],
		[true, "not_applicable", "Sin requisitos adicionales"],
	] as const)(
		"distinguishes safety context and policy: %s / %s",
		async (operationComplete, safetyState, title) => {
			const container = await AstroContainer.create()
			const html = await container.renderToString(ProviderVerificationLineSections, {
				request,
				props: {
					screen: screen([]),
					line: "tour",
					tourArea: "safety",
					experienceId: "tour-a",
					operationComplete,
					safetyState,
				},
			})
			expect(html).toContain(title)
			if (!operationComplete) {
				expect(html).toContain("Completar operación")
				expect(html).toContain("experience=tour-a")
				expect(html).toContain("#tour-operating-context")
			} else {
				expect(html).not.toContain("Completar operación")
			}
		}
	)
	it("does not solicit provisional safety evidence while policy is unresolved", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderVerificationLineSections, {
			request,
			props: {
				screen: screen([
					{
						...license,
						id: "tour.insurance",
						label: "Seguro de la actividad",
						presentationArea: "safety",
					},
				]),
				line: "tour",
				tourArea: "safety",
				experienceId: "tour-a",
				operationComplete: true,
				safetyState: "not_evaluable",
			},
		})
		expect(html).toContain("Requisitos por definir")
		expect(html).not.toContain("Seguro de la actividad")
		expect(html).not.toContain("Revisar acuerdo comercial")
		expect(html).not.toContain("/provider/settings/payments")
		expect(html).toContain("Fastt debe definir los requisitos aplicables")
	})
	it("shows a policy wait in activity without claiming no licenses are needed or opening the contract", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderVerificationLineSections, {
			request,
			props: {
				screen: screen([]),
				line: "tour",
				tourArea: "activity",
				operationComplete: true,
				evaluationPending: true,
			},
		})
		expect(html).toContain("Fastt debe definir los requisitos aplicables")
		expect(html).not.toContain("No hay licencias adicionales")
		expect(html).not.toContain("/provider/settings/payments")
	})
	it("offers multiple departments without requiring a support request", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderTourOperatingContext, {
			request,
			props: { productId: "tour-a", canEdit: true, context: null },
		})
		expect(html).toContain('name="jurisdictionCodes"')
		expect(html).not.toContain('value="requires_review"')
		expect(html).toContain("context=tour_territory")
		expect(html).toContain("experience=tour-a")
		expect(html).toContain("La experiencia incluye un servicio de guía")
		expect(html).toContain("Mi negocio, con su equipo")
		expect(html).toContain("Guardar no aprueba la experiencia")
		expect(html).toContain("data-operation-status")
	})
	it("explains the prerequisite without sending the user back to the same form", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderVerificationLineSections, {
			request,
			props: {
				screen: screen([gap, license]),
				line: "tour",
				tourArea: "activity",
				experienceId: "tour-a",
				operationComplete: false,
			},
		})
		expect(html).toContain("Licencias por determinar")
		expect(html).not.toContain("href=")
		expect(html).not.toContain("Credencial de guía")
	})
	it("links an evaluated license to the evidence area in the current workspace", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderVerificationLineSections, {
			request,
			props: {
				screen: screen([license]),
				line: "tour",
				tourArea: "activity",
				experienceId: "tour-a",
				operationComplete: true,
			},
		})
		expect(html).toContain("Licencias aplicables")
		expect(html).toContain("type=operating_license#tour-evidence-tour-activity")
		expect(html).toContain("/product/tour-a?type=")
	})
	it("keeps the stored declaration visible without offering a save action to a read-only user", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(ProviderTourOperatingContext, {
			request,
			props: {
				productId: "tour-a",
				canEdit: false,
				context: {
					operatingRole: "guide",
					jurisdictionCode: "geo:bo:la-paz-department",
					activityClassesJson: ["urban_cultural"],
				},
			},
		})
		expect(html).toContain("disabled")
		expect(html).toContain("Papel anterior: Guía independiente")
		expect(html).not.toContain('value="self" selected')
		expect(html).toMatch(
			/name="jurisdictionCodes"[^>]*value="geo:bo:la-paz-department"[^>]*checked/
		)
		expect(html).not.toContain("Guardar operación")
	})
})
