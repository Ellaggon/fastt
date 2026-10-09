import { expect, it } from "vitest"
import { presentTourCatalogItem } from "@/lib/tours/tourCatalogPresentation"
import { buildTourDiagnostic, type TourObservations } from "@/lib/tours/buildTourDiagnostic"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { resolveTourCommercialContext } from "@/lib/tours/resolveTourCommercialContext"
import type { ProductPreparationSummary } from "@/lib/playbook/summarize-product-preparation"
import { resolvePlaybookRedirectAfterSave } from "@/lib/playbook/playbook-nav"
function summary(published = false, pending?: string) {
	const context = resolveTourCommercialContext({
		productId: "tour",
		options: [
			{
				variantId: "option",
				name: "Opción",
				bookingMode: "shared",
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
			{ ready: id !== pending, message: "Debe corregirse" },
		])
	) as TourObservations
	const diagnosis = buildTourDiagnostic({
		providerId: "provider",
		productId: "tour",
		context,
		observations,
	})
	return {
		isPublished: published,
		tourContext: context,
		tourPresentation: presentTourDiagnostic(diagnosis, {
			published,
			previewHref: "/product/tour/preview",
		}),
	} as ProductPreparationSummary
}
it("prioritizes incomplete content over an option session", () => {
	const result = presentTourCatalogItem("tour", summary(false, "location"), {
		resumeHref: "/session",
		variantId: "option",
	})
	expect(result.primaryAction.label).toBe("Continuar ficha")
	expect(result.primaryAction.href).toContain("/location?")
})
it("resumes only the selected option and never switches to another session", () => {
	expect(
		presentTourCatalogItem("tour", summary(), { resumeHref: "/session", variantId: "option" })
			.primaryAction.label
	).toBe("Continuar configuración")
	expect(
		presentTourCatalogItem("tour", summary(), { resumeHref: "/session", variantId: "other" })
			.primaryAction.label
	).toBe("Revisar publicación")
	expect(
		presentTourCatalogItem("tour", summary(), {
			resumeHref: "/session",
			variantId: "option",
			handedOff: true,
		}).primaryAction.label
	).toBe("Revisar publicación")
})
it("separates traveler preview from publication and preserves the validated offer", () => {
	const result = presentTourCatalogItem("tour", summary())
	expect(result.previewHref).toContain("/tours/tour?preview=provider")
	for (const href of [result.previewHref, result.publicationHref]) {
		const url = new URL(href, "http://fastt.local")
		expect(url.searchParams.get("variantId")).toBe("option")
		expect(url.searchParams.get("ratePlanId")).toBe("rate")
	}
	expect(result.publicationHref).toContain("/product/tour/preview?")
})
it("manages an operational published tour and preserves a corrective action", () => {
	expect(presentTourCatalogItem("tour", summary(true)).primaryAction.label).toBe(
		"Gestionar opciones y horarios"
	)
	expect(presentTourCatalogItem("tour", summary(true, "conditions")).primaryAction.label).toBe(
		"Revisar condiciones"
	)
})
it("returns an editorial save to its original tour and offer", () => {
	const form = new FormData()
	const href = "/product/tour?variantId=option&ratePlanId=rate"
	form.set("returnTo", href)
	expect(
		resolvePlaybookRedirectAfterSave(form, {
			productId: "tour",
			launchPath: "/product/tour/subtype",
			launchStep: "subtype",
		})
	).toBe(href)
	form.set("returnTo", "/product/other")
	expect(
		resolvePlaybookRedirectAfterSave(form, {
			productId: "tour",
			launchPath: "/product/tour/subtype",
			launchStep: "subtype",
		})
	).toBe("/product/tour")
})

it("does not require a commercial selection to continue independent content", () => {
	const preparation = summary(false, "location")
	preparation.tourContext = {
		...preparation.tourContext!,
		status: "unresolved",
		reason: "selection_required",
	} as ProductPreparationSummary["tourContext"]
	expect(presentTourCatalogItem("tour", preparation).primaryAction.label).toBe("Continuar ficha")
})
