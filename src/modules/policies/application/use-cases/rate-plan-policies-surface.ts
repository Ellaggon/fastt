import {
	createPolicyCapa6,
	createPolicyVersionCapa6,
	derivePolicySummaryFromResolvedPolicies,
	mapResolvedPoliciesToUI,
	replacePolicyAssignmentCapa6,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { logger } from "@/lib/observability/logger"
import { resolveRatePlanOwnerContext } from "@/modules/pricing/public"

export const REQUIRED_POLICY_CATEGORIES = ["Cancellation", "Payment", "CheckIn", "NoShow"] as const

export const POLICY_CATEGORY_ORDER: Record<string, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Ingreso",
	NoShow: "No presentación",
}

type Category = (typeof REQUIRED_POLICY_CATEGORIES)[number]

type SurfaceRatePlan = {
	id: string
	name: string
	isDefault?: boolean | null
	isActive?: boolean | null
	modifierLabel?: string | null
}

export type PolicyPlanView = {
	ratePlanId: string
	ratePlanName: string
	isDefault: boolean
	isActive: boolean
	priceLabel: string
	coverageCount: number
	missingCategories: string[]
	policySummary: string
	policyIdByCategory: Record<string, string | null>
	policyPreviewByCategory: Record<string, string>
}

export type WizardPlanView = {
	variantName: string
	ratePlanId: string
	ratePlanName: string
	priceLabel: string
	missingCategories: string[]
	coverageCount: number
	policyIdByCategory: Record<string, string | null>
	policySummary: string
	policyPreviewByCategory: Record<string, string>
}

function toISODateOnly(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return toISODateOnly(date)
}

export function resolvePolicyDateRange(url: URL): { checkIn: string; checkOut: string } {
	const checkIn = String(url.searchParams.get("checkIn") ?? "").trim() || toISODateOnly(new Date())
	const checkOut = String(url.searchParams.get("checkOut") ?? "").trim() || addDays(checkIn, 1)
	return { checkIn, checkOut }
}

function normalizeCategory(input: string): Category | null {
	if (
		input === "Cancellation" ||
		input === "Payment" ||
		input === "CheckIn" ||
		input === "NoShow"
	) {
		return input
	}
	return null
}

export async function handleRatePlanPoliciesPost(params: {
	request: Request
	ratePlans: SurfaceRatePlan[]
	userId: string
}): Promise<Response> {
	const contentType = String(params.request.headers.get("content-type") ?? "")
	if (!contentType.includes("application/json")) {
		return new Response(JSON.stringify({ error: "invalid_content_type" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	try {
		const body = (await params.request.json()) as {
			intent: "save_category" | "preview"
			ratePlanId: string
			channel?: string | null
			checkIn: string
			checkOut: string
			category?: string
			existingPolicyId?: string | null
			description?: string
			payload?: Record<string, unknown>
		}

		const ratePlanId = String(body.ratePlanId ?? "").trim()
		const channel = String(body.channel ?? "web").trim() || "web"
		const requestCheckIn = String(body.checkIn ?? "").trim()
		const requestCheckOut = String(body.checkOut ?? "").trim()

		if (!ratePlanId || !requestCheckIn || !requestCheckOut) {
			return new Response(JSON.stringify({ error: "missing_context" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (!params.ratePlans.some((plan) => String(plan.id) === ratePlanId)) {
			return new Response(JSON.stringify({ error: "invalid_rate_plan" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
		if (!ownerContext) {
			return new Response(JSON.stringify({ error: "invalid_rate_plan_context" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
		logger.debug("rate_plan_owner_context_resolved", {
			eventScope: "policies_surface_post",
			ratePlanId,
			derivedProductId: ownerContext.productId,
			derivedVariantId: ownerContext.variantId,
		})

		if (body.intent === "preview") {
			const previewResult = await resolveEffectivePolicies({
				productId: ownerContext.productId,
				variantId: ownerContext.variantId,
				ratePlanId,
				checkIn: requestCheckIn,
				checkOut: requestCheckOut,
				channel,
				requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
				onMissingCategory: "return_null",
			})
			return new Response(
				JSON.stringify({
					success: true,
					missingCategories: previewResult.missingCategories,
					policySummary: derivePolicySummaryFromResolvedPolicies(previewResult),
					policies: mapResolvedPoliciesToUI(previewResult),
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } }
			)
		}

		const category = normalizeCategory(String(body.category ?? ""))
		if (!category) {
			return new Response(JSON.stringify({ error: "invalid_category" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const planName =
			params.ratePlans.find((plan) => String(plan.id) === ratePlanId)?.name ?? "Tarifa"
		const description = String(
			body.description ?? `${POLICY_CATEGORY_ORDER[category]} · ${planName}`
		).trim()
		const payload = body.payload ?? {}

		let createdPolicyId = ""
		const existingPolicyId = String(body.existingPolicyId ?? "").trim()
		if (existingPolicyId) {
			const versioned = await createPolicyVersionCapa6({
				previousPolicyId: existingPolicyId,
				description,
				rules: category === "Cancellation" ? undefined : (payload as Record<string, unknown>),
				cancellationTiers:
					category === "Cancellation"
						? ((payload.tiers as Array<Record<string, unknown>> | undefined) ?? []).map((tier) => ({
								daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
								penaltyType: String(tier.penaltyType ?? "percentage") as "percentage" | "nights",
								penaltyAmount: Number(tier.penaltyAmount ?? 0),
							}))
						: undefined,
				actorUserId: params.userId,
			})
			createdPolicyId = versioned.policyId
		} else {
			const created = await createPolicyCapa6({
				category,
				description,
				rules: category === "Cancellation" ? undefined : (payload as Record<string, unknown>),
				cancellationTiers:
					category === "Cancellation"
						? ((payload.tiers as Array<Record<string, unknown>> | undefined) ?? []).map((tier) => ({
								daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
								penaltyType: String(tier.penaltyType ?? "percentage") as "percentage" | "nights",
								penaltyAmount: Number(tier.penaltyAmount ?? 0),
							}))
						: undefined,
			})
			createdPolicyId = created.policyId
		}

		await replacePolicyAssignmentCapa6({
			policyId: createdPolicyId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			channel,
		})

		const latestPreviewResult = await resolveEffectivePolicies({
			productId: ownerContext.productId,
			variantId: ownerContext.variantId,
			ratePlanId,
			checkIn: requestCheckIn,
			checkOut: requestCheckOut,
			channel,
			requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
			onMissingCategory: "return_null",
		})
		return new Response(
			JSON.stringify({
				success: true,
				policyId: createdPolicyId,
				missingCategories: latestPreviewResult.missingCategories,
				policySummary: derivePolicySummaryFromResolvedPolicies(latestPreviewResult),
				policies: mapResolvedPoliciesToUI(latestPreviewResult),
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } }
		)
	} catch (error: any) {
		return new Response(
			JSON.stringify({
				error: "save_failed",
				message: String(error?.message ?? error ?? "Error inesperado"),
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } }
		)
	}
}

export async function buildRatePlanPoliciesSurface(params: {
	variantName: string
	ratePlans: SurfaceRatePlan[]
	checkIn: string
	checkOut: string
}): Promise<{ policyPlans: PolicyPlanView[]; wizardPlans: WizardPlanView[] }> {
	const policyPlans = await Promise.all(
		params.ratePlans.map(async (plan) => {
			const ratePlanId = String(plan.id)
			const ownerContext = await resolveRatePlanOwnerContext(ratePlanId)
			const productId = ownerContext?.productId ?? ""
			const variantId = ownerContext?.variantId ?? ""
			const resolved = await resolveEffectivePolicies({
				productId,
				variantId: variantId || undefined,
				ratePlanId,
				checkIn: params.checkIn,
				checkOut: params.checkOut,
				channel: "web",
				requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
				onMissingCategory: "return_null",
			})
			const policyIdByCategory = Object.fromEntries(
				REQUIRED_POLICY_CATEGORIES.map((category) => [
					category,
					String(
						resolved.policies.find((p: any) => String(p.category) === category)?.policy?.id ?? ""
					) || null,
				])
			)
			const policyPreviewByCategory = Object.fromEntries(
				REQUIRED_POLICY_CATEGORIES.map((category) => {
					const item = resolved.policies.find((p: any) => String(p.category) === category)
					const mapped = mapResolvedPoliciesToUI({
						policies: item ? [item] : [],
						missingCategories: [],
					} as any)
					return [category, String(mapped[0]?.description ?? "Sin definir")]
				})
			)
			return {
				ratePlanId,
				ratePlanName: String(plan.name),
				isDefault: Boolean(plan.isDefault),
				isActive: Boolean(plan.isActive),
				priceLabel: String(plan.modifierLabel ?? "Tarifa según configuración"),
				coverageCount: REQUIRED_POLICY_CATEGORIES.length - resolved.missingCategories.length,
				missingCategories: resolved.missingCategories,
				policySummary: derivePolicySummaryFromResolvedPolicies(resolved),
				policyIdByCategory,
				policyPreviewByCategory,
			}
		})
	)

	const wizardPlans = policyPlans.map((plan) => ({
		variantName: params.variantName,
		ratePlanId: plan.ratePlanId,
		ratePlanName: plan.ratePlanName,
		priceLabel: plan.priceLabel,
		missingCategories: plan.missingCategories,
		coverageCount: plan.coverageCount,
		policyIdByCategory: plan.policyIdByCategory,
		policySummary: plan.policySummary,
		policyPreviewByCategory: plan.policyPreviewByCategory,
	}))

	return { policyPlans, wizardPlans }
}
