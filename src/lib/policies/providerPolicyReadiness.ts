import { listPolicyCoverageByProvider } from "@/modules/policies/public"

const REQUIRED_CATEGORIES = ["Cancellation", "Payment", "CheckIn", "NoShow"] as const

export type ProviderPolicyReadiness = {
	totalRatePlans: number
	readyRatePlans: number
	incompleteRatePlans: number
	summary: string
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

	const today = new Date().toISOString().slice(0, 10)
	const coverage = await listPolicyCoverageByProvider({
		providerId: normalizedProviderId,
		asOfDate: today,
		channel: "web",
		requiredCategories: REQUIRED_CATEGORIES,
	})

	const readyRatePlans = coverage.filter((row) => row.isComplete).length
	const totalRatePlans = coverage.length
	const incompleteRatePlans = Math.max(totalRatePlans - readyRatePlans, 0)
	return {
		totalRatePlans,
		readyRatePlans,
		incompleteRatePlans,
		summary: defaultSummary({ totalRatePlans, readyRatePlans, incompleteRatePlans }),
	}
}
