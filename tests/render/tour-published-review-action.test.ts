import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import { readFileSync } from "node:fs"
import ReviewAction from "@/components/tours/TourPublishedReviewAction.astro"
import { buildTourDiagnostic, type TourObservations } from "@/lib/tours/buildTourDiagnostic"
import { TOUR_REQUIREMENTS, type TourRequirementId } from "@/lib/tours/tourDiagnosticContract"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"

function presentation(
	pending: TourRequirementId | null,
	bookingMode: "shared" | "private" = "shared"
) {
	const context = resolveTourCommercialContext({
		productId: "tour",
		options: [
			{
				variantId: "option",
				name: "Salida",
				bookingMode,
				lifecycleState: "ready",
				salesEnabled: true,
				hasProfile: true,
				hasCapacity: true,
				rates: [{ ratePlanId: "rate", name: "Tarifa", isActive: true, isDefault: true }],
			},
		],
	})
	const observations = Object.fromEntries(
		Object.keys(TOUR_REQUIREMENTS).map((id) => [
			id,
			{
				ready: id !== pending,
				message: "Pendiente real de la oferta elegida",
				...(id === "experience_authorization"
					? {
							action: {
								label: "Revisar licencia",
								href: "/provider/settings/verification?line=tour&experience=tour&returnTo=%2Fproduct%2Ftour%2Fpreview%3FvariantId%3Doption%26ratePlanId%3Drate",
							},
						}
					: {}),
			},
		])
	) as TourObservations
	return presentTourDiagnostic(
		buildTourDiagnostic({ providerId: "provider", productId: "tour", context, observations }),
		{
			published: true,
			previewHref: "/product/tour/preview?variantId=option&ratePlanId=rate",
		}
	)
}

it.each<TourRequirementId>([
	"current_availability",
	"conditions",
	"experience_authorization",
	"option_activation",
	"rate_activation",
])("renders the canonical correction for a published tour with %s pending", async (pending) => {
	const canonical = presentation(pending)
	const container = await AstroContainer.create()
	const html = await container.renderToString(ReviewAction, {
		props: {
			presentation: canonical,
			backHref: "/product/tour?variantId=option&ratePlanId=rate",
			backLabel: "Volver a la ficha",
		},
	})
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
		match[1].replaceAll("&amp;", "&").replaceAll("&#38;", "&")
	)
	expect(hrefs).toContain(canonical.primaryAction.href)
	expect(html).toContain(canonical.primaryAction.label)
	expect(html).toContain(canonical.nextLabel)
	expect(html).toContain(canonical.support)
	expect(html).toContain("Siguiente acción")
	expect(html).not.toContain("La página pública ya está disponible")
	expect(html).not.toContain("publish-product-button")
	if (pending !== "experience_authorization") {
		const target = new URL(canonical.primaryAction.href, "https://fastt.test")
		expect(target.searchParams.get("variantId")).toBe("option")
		expect(target.searchParams.get("ratePlanId")).toBe("rate")
	}
})
it.each(["shared", "private"] as const)(
	"offers review without an artificial correction for a healthy %s",
	async (mode) => {
		const canonical = presentation(null, mode)
		const html = await (
			await AstroContainer.create()
		).renderToString(ReviewAction, {
			props: {
				presentation: canonical,
				backHref: "/product/tour?variantId=option&ratePlanId=rate",
				backLabel: "Volver a la ficha",
			},
		})
		expect(html).toContain("Revisa la oferta publicada")
		expect(html).not.toContain("Siguiente acción")
		expect(html.match(/<a\b/g)).toHaveLength(1)
	}
)
it("connects the published preview to the shared review component", () => {
	const source = readFileSync("src/pages/product/[id]/preview.astro", "utf8")
	expect(source).toMatch(/isPublished && tourPresentation \?\s*\(\s*<TourPublishedReviewAction/)
	expect(source).toContain("presentation={tourPresentation}")
})
