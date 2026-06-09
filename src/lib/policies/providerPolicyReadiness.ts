import { db, eq, Product, RatePlan, Variant } from "astro:db"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import { resolveEffectivePolicies } from "@/modules/policies/public"

const REQUIRED_CATEGORIES = ["Cancellation", "Payment", "CheckIn", "NoShow"] as const

export type ProviderPolicyReadiness = {
	totalRatePlans: number
	readyRatePlans: number
	incompleteRatePlans: number
	summary: string
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	if (Number.isNaN(date.getTime())) return dateOnly
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function defaultSummary(params: {
	totalRatePlans: number
	readyRatePlans: number
	incompleteRatePlans: number
}): string {
	const { totalRatePlans, readyRatePlans, incompleteRatePlans } = params
	if (totalRatePlans === 0) {
		return "0 tarifas: crea tarifas y asigna condiciones para vender."
	}
	return `${totalRatePlans} tarifa${totalRatePlans === 1 ? "" : "s"}: ${readyRatePlans} lista${readyRatePlans === 1 ? "" : "s"}, ${incompleteRatePlans} incompleta${incompleteRatePlans === 1 ? "" : "s"}.`
}

export async function getProviderPolicyReadiness(
	providerId: string
): Promise<ProviderPolicyReadiness> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) {
		return {
			totalRatePlans: 0,
			readyRatePlans: 0,
			incompleteRatePlans: 0,
			summary: "Condiciones pendientes: proveedor no resuelto.",
		}
	}

	const ratePlanName = await resolveRatePlanNameColumn()
	const ratePlans = await db
		.select({
			ratePlanId: RatePlan.id,
			variantId: Variant.id,
			productId: Product.id,
			ratePlanName,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(eq(Product.providerId, normalizedProviderId))
		.all()

	const today = new Date().toISOString().slice(0, 10)
	const tomorrow = addDays(today, 1)
	let readyRatePlans = 0

	for (const row of ratePlans) {
		try {
			const resolved = await resolveEffectivePolicies({
				productId: String(row.productId),
				variantId: String(row.variantId),
				ratePlanId: String(row.ratePlanId),
				checkIn: today,
				checkOut: tomorrow,
				channel: "web",
				requiredCategories: [...REQUIRED_CATEGORIES],
				requestId: `sidebar-policy-readiness:${String(row.ratePlanId)}`,
			})
			if ((resolved.missingCategories ?? []).length === 0) readyRatePlans += 1
		} catch {
			// A failed policy resolution leaves this rate plan incomplete in the readiness summary.
		}
	}

	const totalRatePlans = ratePlans.length
	const incompleteRatePlans = Math.max(totalRatePlans - readyRatePlans, 0)
	return {
		totalRatePlans,
		readyRatePlans,
		incompleteRatePlans,
		summary: defaultSummary({ totalRatePlans, readyRatePlans, incompleteRatePlans }),
	}
}
