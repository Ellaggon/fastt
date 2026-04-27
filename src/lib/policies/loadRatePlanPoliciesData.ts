import { loadRatePlanPricingData } from "@/lib/pricing/loadRatePlanPricingData"
import { getRatePlanById } from "@/modules/pricing/public"
import { buildRatePlanPoliciesSurface } from "@/modules/policies/public"

type Input = {
	request: Request
	ratePlanId: string
	checkIn: string
	checkOut: string
}

export type LoadedRatePlanPoliciesData =
	| { redirectTo: string }
	| {
			context: {
				productName: string
				variantName: string
				ratePlanName: string
			}
			selectedRatePlans: Array<{
				id: string
				name: string
				isDefault?: boolean | null
				isActive?: boolean | null
				modifierLabel?: string | null
			}>
			policyPlans: Awaited<ReturnType<typeof buildRatePlanPoliciesSurface>>["policyPlans"]
			wizardPlans: Awaited<ReturnType<typeof buildRatePlanPoliciesSurface>>["wizardPlans"]
	  }

export async function loadRatePlanPoliciesData(input: Input): Promise<LoadedRatePlanPoliciesData> {
	const requestId = String(input.request.headers.get("x-request-id") ?? crypto.randomUUID()).trim()
	const loadedRatePlan = await loadRatePlanPricingData({
		request: input.request,
		ratePlanId: input.ratePlanId,
	})
	if ("redirectTo" in loadedRatePlan) return loadedRatePlan

	const { loaded, ownerContext } = loadedRatePlan
	const targetRatePlan = (await getRatePlanById(ownerContext.ratePlanId)) as {
		id?: string
		isDefault?: boolean
		isActive?: boolean
		name?: string
		template?: { name?: string } | null
	} | null
	if (!targetRatePlan?.id) return { redirectTo: "/rates/plans" }

	const selectedRatePlans: Array<{
		id: string
		name: string
		isDefault?: boolean
		isActive?: boolean
		modifierLabel?: string
	}> = [
		{
			id: String(targetRatePlan.id),
			name: String(targetRatePlan.template?.name ?? "Tarifa"),
			isDefault: Boolean(targetRatePlan.isDefault),
			isActive: Boolean(targetRatePlan.isActive),
			modifierLabel: "Tarifa según configuración",
		},
	]

	const { policyPlans, wizardPlans } = await buildRatePlanPoliciesSurface({
		variantName: String(loaded.variant.name),
		ratePlans: selectedRatePlans,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		requestId,
		featureContext: {
			request: input.request,
			query: new URL(input.request.url).searchParams,
		},
	})

	return {
		context: {
			productName: String(loadedRatePlan.displayContext.productName),
			variantName: String(loadedRatePlan.displayContext.variantName),
			ratePlanName: String(targetRatePlan.name),
		},
		selectedRatePlans,
		policyPlans,
		wizardPlans,
	}
}
