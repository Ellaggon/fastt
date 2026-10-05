import { TOUR_REQUIREMENTS, type TourDiagnostic } from "@/lib/tours/tourDiagnosticContract"
export function tourDiagnosticFixture(): TourDiagnostic {
	return {
		version: 1,
		context: {
			providerId: "provider",
			productId: "tour",
			selection: {
				state: "resolved",
				variantId: "option",
				ratePlanId: "rate",
				bookingMode: "shared",
				source: "url",
			},
			timezone: "America/La_Paz",
			observedAt: "2026-10-04T12:00:00Z",
		},
		requirements: Object.fromEntries(
			Object.entries(TOUR_REQUIREMENTS).map(([id, definition]) => [
				id,
				{
					scope:
						definition.scope === "product"
							? { kind: "product", productId: "tour" }
							: definition.scope === "option"
								? { kind: "option", productId: "tour", variantId: "option" }
								: { kind: "rate", productId: "tour", variantId: "option", ratePlanId: "rate" },
					result: { state: "ready", evidence: { source: "render-fixture", reference: id } },
				},
			])
		) as TourDiagnostic["requirements"],
	}
}
