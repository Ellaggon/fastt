import { listPolicyCoverageByProvider } from "@/modules/policies/public"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"
import { listRatePlansByProvider } from "@/modules/pricing/public"

type ProviderRatePlanContext = { ratePlanId: string; productType: string }

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
	providerId: string,
	scope?: { ratePlanIds?: readonly string[] }
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

	const scopedIds = scope?.ratePlanIds
		? new Set(scope.ratePlanIds.map((ratePlanId) => String(ratePlanId)))
		: null
	if (scopedIds && scopedIds.size === 0) {
		return {
			totalRatePlans: 0,
			readyRatePlans: 0,
			incompleteRatePlans: 0,
			summary: defaultSummary({ totalRatePlans: 0, readyRatePlans: 0, incompleteRatePlans: 0 }),
		}
	}

	const ratePlans = (
		(await listRatePlansByProvider(normalizedProviderId)) as ProviderRatePlanContext[]
	).filter((plan) => !scopedIds || scopedIds.has(String(plan.ratePlanId)))
	const totalRatePlans = ratePlans.length
	if (!totalRatePlans) {
		return {
			totalRatePlans: 0,
			readyRatePlans: 0,
			incompleteRatePlans: 0,
			summary: defaultSummary({ totalRatePlans: 0, readyRatePlans: 0, incompleteRatePlans: 0 }),
		}
	}

	const plansByContract = new Map<
		string,
		{ categories: readonly string[]; ratePlanIds: Set<string> }
	>()
	for (const plan of ratePlans) {
		const categories = getRequiredPolicyCategories(plan.productType)
		const contractKey = JSON.stringify(categories)
		const group = plansByContract.get(contractKey) ?? { categories, ratePlanIds: new Set<string>() }
		group.ratePlanIds.add(String(plan.ratePlanId))
		plansByContract.set(contractKey, group)
	}

	const today = new Date().toISOString().slice(0, 10)
	const coverageByContract = new Map<string, Map<string, boolean>>()
	await Promise.all(
		[...plansByContract.entries()].map(async ([contractKey, group]) => {
			if (!group.categories.length) return
			const coverage = await listPolicyCoverageByProvider({
				providerId: normalizedProviderId,
				asOfDate: today,
				channel: "web",
				requiredCategories: group.categories,
			})
			coverageByContract.set(
				contractKey,
				new Map(
					coverage
						.filter((row) => group.ratePlanIds.has(String(row.ratePlanId)))
						.map((row) => [String(row.ratePlanId), row.isComplete])
				)
			)
		})
	)

	const readyRatePlans = ratePlans.filter((plan) => {
		const categories = getRequiredPolicyCategories(plan.productType)
		if (!categories.length) return false
		return coverageByContract.get(JSON.stringify(categories))?.get(String(plan.ratePlanId)) === true
	}).length
	const incompleteRatePlans = Math.max(totalRatePlans - readyRatePlans, 0)
	return {
		totalRatePlans,
		readyRatePlans,
		incompleteRatePlans,
		summary: defaultSummary({ totalRatePlans, readyRatePlans, incompleteRatePlans }),
	}
}
