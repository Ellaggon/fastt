import { createHash } from "node:crypto"
import { z } from "zod"

import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"
import * as persistentCache from "@/lib/cache/persistentCache"
import { cacheKeys } from "@/lib/cache/cacheKeys"
import {
	buildPolicySnapshot,
	type PolicyExceptionRule,
	type ResolveEffectivePoliciesResult,
} from "@/modules/policies/public"

const createInventoryHoldSchema = z.object({
	variantId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	rooms: z.number().int().min(1).optional(),
	// Deprecated legacy alias kept for controlled compatibility.
	occupancy: z.number().int().min(1).optional(),
	sessionId: z.string().min(1),
})

export type CreateInventoryHoldInput = z.infer<typeof createInventoryHoldSchema>

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function toStableUuidFromString(value: string): string {
	const hash = createHash("sha1").update(value).digest("hex")
	const bytes = hash.slice(0, 32).split("")
	// UUID v5 layout bits (deterministic hash-based)
	bytes[12] = "5"
	const variantNibble = parseInt(bytes[16], 16)
	bytes[16] = ((variantNibble & 0x3) | 0x8).toString(16)
	const normalized = bytes.join("")
	return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`
}

function buildIdempotencyHoldId(input: {
	sessionId: string
	variantId: string
	from: string
	to: string
}): string {
	const key = `hold:${input.sessionId}:${input.variantId}:${input.from}:${input.to}`
	return toStableUuidFromString(key)
}

export async function createInventoryHold(
	deps: {
		repo: InventoryHoldRepositoryPort
		resolvePricingSnapshot: (params: {
			variantId: string
			from: string
			to: string
			rooms: number
		}) => Promise<unknown | null>
		resolveEffectivePolicies: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			checkIn?: string
			checkOut?: string
			channel?: string
			requiredCategories?: string[]
			onMissingCategory?: "return_null" | "throw_error"
		}) => Promise<ResolveEffectivePoliciesResult>
		resolvePolicyExceptionRules?: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			checkIn?: string
			checkOut?: string
			channel?: string
		}) => Promise<PolicyExceptionRule[]>
		auditPolicySnapshot?: (event: {
			eventType: "policy_snapshot_created" | "policy_override_resolved"
			policyId?: string | null
			policyGroupId?: string | null
			scope?: string | null
			scopeId?: string | null
			channel?: string | null
			after?: unknown
		}) => Promise<void>
		buildGuestExpectationsSnapshot?: (productId: string) => Promise<unknown | null>
		policyContext: {
			productId: string
			ratePlanId: string
			channel?: string | null
		}
	},
	input: CreateInventoryHoldInput
): Promise<{ holdId: string; expiresAt: Date }> {
	const parsed = createInventoryHoldSchema.parse(input)
	const requestedRooms = Number(parsed.rooms ?? parsed.occupancy ?? 0)
	if (!Number.isFinite(requestedRooms) || requestedRooms < 1) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["rooms"],
				message: "rooms must be >= 1",
			},
		])
	}
	const checkIn = parseDateOnly(parsed.dateRange.from)
	const checkOut = parseDateOnly(parsed.dateRange.to)

	if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["dateRange"],
				message: "Invalid date range",
			},
		])
	}

	const now = new Date()
	const policyRatePlanId = String(deps.policyContext.ratePlanId ?? "").trim()
	if (!policyRatePlanId) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["ratePlanId"],
				message: "Missing ratePlanId policy context",
			},
		])
	}
	const holdId = buildIdempotencyHoldId({
		sessionId: parsed.sessionId,
		variantId: parsed.variantId,
		from: parsed.dateRange.from,
		to: parsed.dateRange.to,
	})

	const existing = await deps.repo.findActiveHold({ holdId, now })
	if (existing) {
		return {
			holdId: existing.holdId,
			expiresAt: existing.expiresAt,
		}
	}

	const expiresAt = new Date(now.getTime() + 10 * 60 * 1000)
	const pricingSnapshot = await deps.resolvePricingSnapshot({
		variantId: parsed.variantId,
		from: parsed.dateRange.from,
		to: parsed.dateRange.to,
		rooms: requestedRooms,
	})
	const resolvedPolicies = await deps.resolveEffectivePolicies({
		productId: deps.policyContext.productId,
		variantId: parsed.variantId,
		ratePlanId: policyRatePlanId,
		checkIn: parsed.dateRange.from,
		checkOut: parsed.dateRange.to,
		channel: deps.policyContext.channel == null ? undefined : String(deps.policyContext.channel),
	})
	const policyExceptionRules = deps.resolvePolicyExceptionRules
		? await deps.resolvePolicyExceptionRules({
				productId: deps.policyContext.productId,
				variantId: parsed.variantId,
				ratePlanId: policyRatePlanId,
				checkIn: parsed.dateRange.from,
				checkOut: parsed.dateRange.to,
				channel:
					deps.policyContext.channel == null ? undefined : String(deps.policyContext.channel),
			})
		: []

	const policySnapshot = buildPolicySnapshot({
		resolvedPolicies,
		checkIn: parsed.dateRange.from,
		checkOut: parsed.dateRange.to,
		channel: deps.policyContext.channel,
		resolvedAt: now,
		exceptionRules: policyExceptionRules,
	})
	if (deps.auditPolicySnapshot) {
		await deps.auditPolicySnapshot({
			eventType: "policy_snapshot_created",
			scope: "rate_plan",
			scopeId: policyRatePlanId,
			channel: deps.policyContext.channel ?? null,
			after: {
				productId: deps.policyContext.productId,
				variantId: parsed.variantId,
				ratePlanId: policyRatePlanId,
				checkIn: parsed.dateRange.from,
				checkOut: parsed.dateRange.to,
				policyVersionIds: policySnapshot.meta.policyVersionIds,
			},
		})
		for (const item of [
			policySnapshot.cancellation,
			policySnapshot.payment,
			policySnapshot.no_show,
			policySnapshot.check_in,
		]) {
			for (const override of item?.appliedOverrides ?? []) {
				await deps.auditPolicySnapshot({
					eventType: "policy_override_resolved",
					policyId: item?.policyId ?? null,
					policyGroupId: item?.groupId ?? null,
					scope: "rate_plan",
					scopeId: policyRatePlanId,
					channel: deps.policyContext.channel ?? null,
					after: {
						overrideId: override.id,
						overrideType: override.type,
						category: item?.category ?? null,
						reason: override.reason,
					},
				})
			}
		}
	}
	const guestExpectationsSnapshot = deps.buildGuestExpectationsSnapshot
		? await deps.buildGuestExpectationsSnapshot(deps.policyContext.productId)
		: null
	const created = await deps.repo.holdInventory({
		holdId,
		variantId: parsed.variantId,
		ratePlanId: policyRatePlanId,
		checkIn,
		checkOut,
		quantity: requestedRooms,
		expiresAt,
		channel: deps.policyContext.channel,
		policySnapshotJson: policySnapshot,
		guestExpectationsSnapshotJson: guestExpectationsSnapshot,
	})

	if (!created.success) {
		throw new Error("not_available")
	}

	if (pricingSnapshot) {
		void persistentCache
			.set(cacheKeys.holdPricingSnapshot(created.holdId), pricingSnapshot, 10 * 60)
			.catch(() => {})
	}
	void persistentCache
		.set(cacheKeys.holdPolicySnapshot(created.holdId), policySnapshot, 10 * 60)
		.catch(() => {})

	return {
		holdId: created.holdId,
		expiresAt: created.expiresAt,
	}
}
