import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it, vi } from "vitest"
import { tourDiagnosticFixture } from "../test-support/tour-diagnostic-fixture"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
const state = vi.hoisted(() => ({ format: null as string | null }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/modules/catalog/public", () => ({
	getProductById: async () => ({ id: "tour", productType: "tour" }),
	getProductFullAggregate: async () => ({ displayName: "Experiencia guardada" }),
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()),
	Tour: { productId: "id" },
	Hotel: {},
	Package: {},
	Limousine: {},
	eq: () => true,
	first: (rows: any[]) => rows[0],
	db: {
		select: () => ({
			from: () => ({
				leftJoin() {
					return this
				},
				where: () =>
					Promise.resolve([
						{
							experienceFormat: state.format,
							duration: "1 hora",
							durationMinutes: 60,
							meetingPointJson: { address: "Sala" },
							itineraryJson: [{ description: "Práctica guardada" }],
							includesJson: ["Materiales"],
						},
					]),
			}),
		}),
	},
}))
vi.mock("@/lib/tours/loadTourCommercialContext", () => ({
	loadTourCommercialContext: async () => ({
		status: "resolved",
		productId: "tour",
		variantId: "option",
		ratePlanId: "rate",
		options: [],
		option: { name: "Horario" },
	}),
}))
const progress = () => {
	const diagnosis = tourDiagnosticFixture()
	diagnosis.context.experienceFormat = state.format as never
	return {
		progress: { progressPercent: 100 },
		tourPresentation: presentTourDiagnostic(diagnosis, {
			published: false,
			previewHref: "/product/tour/preview",
		}),
	}
}
vi.mock("@/lib/playbook/evaluate-tour-launch-progress", () => ({
	evaluateTourLaunchProgress: async () => progress(),
}))
vi.mock("@/lib/playbook/evaluate-complete-to-publish-progress", () => ({
	evaluateCompleteToPublishProgress: async () => progress(),
}))
import Page from "@/pages/product/[id]/subtype.astro"
it.each(["guided_tour", "class", "workshop", "tasting", null])(
	"page renders one complete form for %s in all three contexts",
	async (format) => {
		state.format = format
		for (const context of ["prepare", "review", "edit"]) {
			const query = new URLSearchParams({
				variantId: "option",
				ratePlanId: "rate",
				returnTo:
					context === "review"
						? "/product/tour/preview?playbook=complete-to-publish&step=preview&flow=complete&variantId=option&ratePlanId=rate"
						: "/product/tour?variantId=option&ratePlanId=rate",
			})
			if (context === "edit") {
				query.delete("variantId")
				query.delete("ratePlanId")
			}
			if (context !== "edit") {
				query.set("playbook", context === "prepare" ? "launch-tour" : "complete-to-publish")
				query.set("step", "subtype")
				query.set("flow", context === "prepare" ? "create" : "complete")
				query.set("tourFlowVersion", "2")
			}
			const container = await AstroContainer.create()
			const html = await container.renderToString(Page, {
				request: new Request(`https://fastt.test/product/tour/subtype?${query}`),
				params: { id: "tour" },
				locals: {
					getWorkspaceContext: async () => ({
						user: { id: "user" },
						provider: null,
						sidebarDataPromise: Promise.resolve(null),
						workspaceExperience: "essential",
						showProfessionalToggle: false,
					}),
				} as never,
			})
			for (const id of [
				"subtypeForm",
				"durationMinutes",
				"tourItinerary",
				"tourIncludes",
				"stateRecovery",
			])
				expect(html.match(new RegExp(`id="${id}"`, "g")), `${context}:${id}`).toHaveLength(1)
			expect(html).toContain("Práctica guardada")
			expect(html).toContain(
				`data-program-minimum="${format === null || format === "guided_tour" ? 3 : 1}"`
			)
			expect(html.includes('name="guideType"')).toBe(format === null || format === "guided_tour")
			expect(html).toContain('name="returnTo"')
			if (context !== "edit") expect(html).toContain('name="variantId" value="option"')
			if (context !== "edit") expect(html).toContain('name="ratePlanId" value="rate"')
			if (context === "prepare") expect(html.match(/data-tour-stage-id=/g)).toHaveLength(5)
		}
	}
)
