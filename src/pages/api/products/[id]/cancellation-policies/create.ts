import type { APIRoute } from "astro"
import {
	assignPolicyCapa6UseCase,
	createPolicyCapa6UseCase,
} from "@/container/policies-write.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { productRepository } from "@/container"
import {
	legacyCancellationPolicyError,
	legacyCancellationPolicyJson,
} from "@/lib/policies/legacyCancellationPolicyApi"

const SUCCESSOR_API = "/api/policies/create"

export const POST: APIRoute = async ({ params, request }) => {
	const { providerId } = await requireProvider(request)
	const productId = params.id
	if (!productId) return legacyCancellationPolicyError("Missing productId", 400, SUCCESSOR_API)
	const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
	if (!owned) {
		return legacyCancellationPolicyError("Not found", 404, SUCCESSOR_API)
	}

	const { name, tiers } = await request.json()
	const created = await createPolicyCapa6UseCase({
		ownerProviderId: providerId,
		category: "Cancellation",
		description: String(name ?? ""),
		status: "active",
		policyPresetKey: "legacy_cancellation_custom",
		stayLengthType: "any",
		refundBasis: "total_booking",
		payoutBasis: "collected",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		cancellationTiers: Array.isArray(tiers) ? tiers : [],
	})
	await assignPolicyCapa6UseCase({
		policyId: created.policyId,
		scope: "product",
		scopeId: productId,
		channel: null,
	})
	return legacyCancellationPolicyJson(
		{ success: true, groupId: created.groupId, id: created.policyId },
		SUCCESSOR_API,
		{ status: 200 }
	)
}
