import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	derivePolicySummaryFromResolvedPolicies,
	normalizePolicyResolutionResult,
	REQUIRED_POLICY_CATEGORIES,
	resolveEffectivePolicies,
	resolvePolicyDateRange,
} from "@/modules/policies/public"
import { listRatePlansByProvider } from "@/modules/pricing/public"

export const GET: APIRoute = async ({ request, url }) => {
	const user = await getUserFromRequest(request)
	if (!user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "Provider profile not found" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const rows = await listRatePlansByProvider(providerId)
	const requestUrl = url ?? new URL(request.url || "http://localhost:4321/api/rates/plans")
	const { checkIn, checkOut } = resolvePolicyDateRange(requestUrl)
	const channel = String(requestUrl.searchParams.get("channel") ?? "").trim() || "web"
	const requiredCategories = [...REQUIRED_POLICY_CATEGORIES]

	const rowsWithPolicySummary = await Promise.all(
		rows.map(async (row: any) => {
			const ratePlanId = String(row?.ratePlanId ?? "")
			const productId = String(row?.productId ?? "")
			const variantId = String(row?.variantId ?? "")
			if (!ratePlanId || !productId) {
				return {
					...row,
					policyCoverage: {
						totalCategories: requiredCategories.length,
						coveredCategories: 0,
						missingCategories: requiredCategories,
						isComplete: false,
					},
					policySummary: "Sin condiciones configuradas",
				}
			}

			try {
				const resolvedRaw = await resolveEffectivePolicies({
					productId,
					variantId: variantId || undefined,
					ratePlanId,
					checkIn,
					checkOut,
					channel,
					requiredCategories,
					onMissingCategory: "return_null",
				})
				const resolved = normalizePolicyResolutionResult(resolvedRaw, {
					asOfDate: checkIn,
					warnings: [],
				}).dto
				const missingCategories = resolved.missingCategories
				const coveredCategories = Math.max(requiredCategories.length - missingCategories.length, 0)
				return {
					...row,
					policyCoverage: {
						totalCategories: requiredCategories.length,
						coveredCategories,
						missingCategories,
						isComplete: missingCategories.length === 0,
					},
					policySummary: derivePolicySummaryFromResolvedPolicies(resolved),
				}
			} catch {
				return {
					...row,
					policyCoverage: {
						totalCategories: requiredCategories.length,
						coveredCategories: 0,
						missingCategories: requiredCategories,
						isComplete: false,
					},
					policySummary: "Sin condiciones configuradas",
				}
			}
		})
	)

	return new Response(JSON.stringify({ ratePlans: rowsWithPolicySummary }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
