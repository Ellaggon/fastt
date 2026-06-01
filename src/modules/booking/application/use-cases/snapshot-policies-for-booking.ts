import { randomUUID } from "crypto"

import type { BookingPolicySnapshotRepositoryPort } from "../ports/BookingPolicySnapshotRepositoryPort"
import { BookingValidationError } from "../errors/bookingValidationError"
import { buildPolicyItemSnapshot } from "@/modules/policies/public"

export type SnapshotPoliciesForBookingInput = {
	bookingId: string
	productId: string
	variantId: string
	ratePlanId: string
	channel?: string | null
	checkIn?: string
	checkOut?: string
}

export async function snapshotPoliciesForBooking(
	deps: {
		repo: BookingPolicySnapshotRepositoryPort
		resolveEffectivePolicies: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			channel?: string
			checkIn?: string
			checkOut?: string
		}) => Promise<{
			policies: Array<{
				category: string
				policy: {
					id: string
					groupId: string
					description: string
					version: number
					status: "active"
					policyPresetKey?: string | null
					stayLengthType?: string | null
					gracePeriod?: number | null
					refundBasis?: string | null
					payoutBasis?: string | null
					localTimezone?: string | null
					legalOverrideFlags?: Record<string, boolean> | null
					effectiveFrom?: string | null
					effectiveTo?: string | null
					rules: unknown[]
					cancellationTiers: unknown[]
				}
				resolvedFromScope: string
			}>
		}>
	},
	input: SnapshotPoliciesForBookingInput
) {
	const bookingId = String(input.bookingId ?? "").trim()
	const productId = String(input.productId ?? "").trim()
	const variantId = String(input.variantId ?? "").trim()
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	const channel = input.channel == null ? undefined : String(input.channel)

	if (!bookingId) throw new BookingValidationError([{ path: ["bookingId"], code: "required" }])
	if (!productId) throw new BookingValidationError([{ path: ["productId"], code: "required" }])
	if (!variantId) throw new BookingValidationError([{ path: ["variantId"], code: "required" }])
	if (!ratePlanId) throw new BookingValidationError([{ path: ["ratePlanId"], code: "required" }])

	// Immutable: once any snapshot rows exist for a booking, do not write again.
	const existing = await deps.repo.listByBookingId(bookingId)
	if (existing.length > 0) {
		throw new BookingValidationError([{ path: ["bookingId"], code: "snapshot_already_exists" }])
	}

	const resolved = await deps.resolveEffectivePolicies({
		productId,
		variantId,
		ratePlanId,
		channel,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
	})

	if (!resolved.policies.length) {
		// OTA-safe behavior: snapshot can be empty, but we still consider it "snapshotted".
		// We keep it explicit by storing no rows (immutable empty snapshot).
		return { created: 0 }
	}

	const now = new Date()
	const rows = resolved.policies.map((p) => {
		const enriched = (() => {
			try {
				return buildPolicyItemSnapshot(
					p as any,
					input.checkIn ?? new Date().toISOString().slice(0, 10)
				)
			} catch {
				return null
			}
		})()
		return {
			id: randomUUID(),
			bookingId,
			category: String(p.category),
			policyId: String(p.policy.id),
			policySnapshotJson: {
				category: p.category,
				resolvedFromScope: p.resolvedFromScope,
				policy: p.policy,
				source: enriched?.source ?? {
					policyId: String(p.policy.id),
					groupId: String(p.policy.groupId),
					version: Number(p.policy.version ?? 0),
					resolvedFromScope: String(p.resolvedFromScope ?? "global"),
					policyPresetKey:
						p.policy.policyPresetKey == null ? null : String(p.policy.policyPresetKey),
				},
				metadata: enriched?.metadata ?? null,
				calculation: enriched?.calculation ?? null,
			},
			createdAt: now,
		}
	})

	await deps.repo.insertMany(rows)
	return { created: rows.length }
}
