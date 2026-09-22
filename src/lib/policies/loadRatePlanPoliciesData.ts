import {
	loadRatePlanPricingData,
	type LoadedRatePlanPricingData,
} from "@/lib/pricing/loadRatePlanPricingData"
import { routes } from "@/lib/routes"
import { getRatePlanById } from "@/modules/pricing/public"
import { buildRatePlanPoliciesSurface } from "@/modules/policies/public"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"

type Input = {
	request: Request
	ratePlanId: string
	checkIn: string
	checkOut: string
	loadedRatePlan?: LoadedRatePlanPricingData | Promise<LoadedRatePlanPricingData>
	includePricingEditorData?: boolean
	timing?: ServerTimingRecorder
}

export type LoadedRatePlanPoliciesData =
	| { redirectTo: string }
	| {
			context: {
				productId: string
				variantId: string
				productName: string
				variantName: string
				ratePlanName: string
			}
			policyPlans: Awaited<ReturnType<typeof buildRatePlanPoliciesSurface>>["policyPlans"]
	  }

export async function loadRatePlanPoliciesData(input: Input): Promise<LoadedRatePlanPoliciesData> {
	const requestId = String(input.request.headers.get("x-request-id") ?? crypto.randomUUID()).trim()
	const loadedRatePlan = await (input.loadedRatePlan ??
		loadRatePlanPricingData({
			request: input.request,
			ratePlanId: input.ratePlanId,
			includePricingEditorData: input.includePricingEditorData,
		}))
	if ("redirectTo" in loadedRatePlan) return loadedRatePlan

	const { loaded, ownerContext } = loadedRatePlan
	const targetRatePlan = (await getRatePlanById(ownerContext.ratePlanId)) as {
		id?: string
		isDefault?: boolean
		isActive?: boolean
		name?: string
		template?: { name?: string } | null
	} | null
	if (!targetRatePlan?.id) return { redirectTo: routes.ratePlansList() }

	const ratePlans: Array<{
		id: string
		name: string
		isDefault?: boolean
		productId: string
		variantId: string
	}> = [
		{
			id: String(targetRatePlan.id),
			name: String(targetRatePlan.template?.name ?? "Tarifa"),
			isDefault: Boolean(targetRatePlan.isDefault),
			productId: String(loaded.productId),
			variantId: String(loaded.variantId),
		},
	]

	const { policyPlans } = await buildRatePlanPoliciesSurface({
		ratePlans,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		requestId,
		featureContext: {
			request: input.request,
			query: new URL(input.request.url).searchParams,
		},
		timing: input.timing,
	})

	return {
		context: {
			productId: String(loaded.productId),
			variantId: String(loaded.variantId),
			productName: String(loadedRatePlan.displayContext.productName),
			variantName: String(loadedRatePlan.displayContext.variantName),
			ratePlanName: String(targetRatePlan.name),
		},
		policyPlans,
	}
}
