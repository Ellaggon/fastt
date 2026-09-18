import type { APIRoute } from "astro"
import {
	createPolicyCapa6UseCase,
	replacePolicyAssignmentCapa6UseCase,
} from "@/container/policies-write.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { invalidatePolicyConditions, invalidateProduct } from "@/lib/cache/invalidation"
import { getOrCreateProviderPresetPolicy } from "@/lib/policies/getOrCreateProviderPresetPolicy"
import {
	ensurePolicyOwnedByProvider,
	ensurePolicyScopeOwnedByProvider,
	resolveProductIdForPolicyScope,
} from "@/lib/policies/policyOwnership"
import { isSupportedTourPaymentType } from "@/lib/tours/tour-payment-terms"
import {
	db,
	eq,
	first,
	Policy,
	PolicyGroup,
	PolicyRule,
	Product,
} from "@/shared/infrastructure/db/compat"
import type { PolicyCategory } from "@/modules/policies/public"

const validCategories = new Set(["Cancellation", "Payment", "CheckIn", "NoShow"])
const validScopes = new Set(["product", "variant", "rate_plan"])
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function text(value: unknown) {
	return String(value ?? "").trim()
}

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProvider(request)
	const actorUserId = String(user?.id ?? "").trim() || undefined
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
	if (!body) return json(400, { error: "invalid_json" })

	const mode = text(body.mode)
	const scope = text(body.scope)
	const scopeId = text(body.scopeId)
	const channel = text(body.channel) || null

	if (!validScopes.has(scope) || !scopeId) {
		return json(400, { error: "invalid_scope" })
	}

	const scopeOwned = await ensurePolicyScopeOwnedByProvider({ providerId, scope, scopeId })
	if (!scopeOwned) {
		return json(403, { error: "scope_not_owned" })
	}
	const scopedProductId = await resolveProductIdForPolicyScope({ scope, scopeId })
	const product = scopedProductId
		? await db
				.select({ productType: Product.productType })
				.from(Product)
				.where(eq(Product.id, scopedProductId))
				.then(first)
		: null
	const isTourScope = String(product?.productType ?? "").toLowerCase() === "tour"

	let policyId = text(body.policyId)
	let category = text(body.category) as PolicyCategory

	if (mode === "existing") {
		if (!policyId) return json(400, { error: "missing_policy" })
		const policyOwned = await ensurePolicyOwnedByProvider({ providerId, policyId })
		if (!policyOwned) return json(403, { error: "policy_not_owned" })
		if (isTourScope) {
			const policy = await db
				.select({ category: PolicyGroup.category })
				.from(Policy)
				.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
				.where(eq(Policy.id, policyId))
				.then(first)
			category = String(policy?.category ?? category) as PolicyCategory
			if (category === "Payment") {
				const paymentRule = await db
					.select({ value: PolicyRule.ruleValue })
					.from(PolicyRule)
					.where(eq(PolicyRule.policyId, policyId))
					.then(
						(rows) =>
							rows.find((row) => String((row as any).ruleKey ?? "") === "paymentType") ?? null
					)
				if (!isSupportedTourPaymentType(paymentRule?.value)) {
					return json(409, { error: "tour_prepayment_not_available" })
				}
			}
		}
	} else if (mode === "preset") {
		const policyPresetKey = text(body.policyPresetKey)
		if (!validCategories.has(category) || !policyPresetKey) {
			return json(400, { error: "invalid_preset_context" })
		}
		if (isTourScope && category === "Payment" && policyPresetKey !== "pay_at_property") {
			return json(409, { error: "tour_prepayment_not_available" })
		}

		const presetPolicy = await getOrCreateProviderPresetPolicy({
			providerId,
			actorUserId,
			category,
			policyPresetKey,
		})
		policyId = presetPolicy.policyId
	} else if (mode === "draft") {
		if (!validCategories.has(category)) {
			return json(400, { error: "invalid_draft_context" })
		}
		const rules = typeof body.rules === "object" && body.rules ? body.rules : {}
		if (
			isTourScope &&
			category === "Payment" &&
			!isSupportedTourPaymentType((rules as Record<string, unknown>).paymentType)
		) {
			return json(409, { error: "tour_prepayment_not_available" })
		}
		if (category === "CheckIn") {
			const checkInFrom = text((rules as Record<string, unknown>).checkInFrom)
			const checkInUntil = text((rules as Record<string, unknown>).checkInUntil)
			const checkOutUntil = text((rules as Record<string, unknown>).checkOutUntil)
			if (
				!timePattern.test(checkInFrom) ||
				!timePattern.test(checkInUntil) ||
				!timePattern.test(checkOutUntil)
			) {
				return json(400, { error: "invalid_check_in_times" })
			}
		}
		const created = await createPolicyCapa6UseCase({
			ownerProviderId: providerId,
			category,
			description:
				text(body.description) ||
				(category === "CheckIn" ? "Horario personalizado" : "Condición personalizada"),
			status: "active",
			stayLengthType: "any",
			gracePeriod: 0,
			refundBasis:
				category === "Cancellation"
					? "total_booking"
					: category === "NoShow"
						? "first_night"
						: category === "CheckIn"
							? "none"
							: "provider_policy",
			payoutBasis: category === "Payment" || category === "CheckIn" ? "provider_policy" : "gross",
			localTimezone: "property_local",
			rules: rules as Record<string, unknown>,
			cancellationTiers: Array.isArray(body.cancellationTiers)
				? (body.cancellationTiers as any)
				: undefined,
			actorUserId,
		})
		policyId = created.policyId
	} else {
		return json(400, { error: "invalid_mode" })
	}

	const result = await replacePolicyAssignmentCapa6UseCase({
		policyId,
		scope: scope as "product" | "variant" | "rate_plan",
		scopeId,
		channel,
		actorUserId,
	})
	const productId = await resolveProductIdForPolicyScope({ scope, scopeId })
	await invalidatePolicyConditions({ scope, scopeId, productId })
	if (productId) await invalidateProduct(productId)

	return json(200, {
		success: true,
		policyId,
		assignmentId: result.assignmentId,
		replaced: result.replaced,
	})
}
