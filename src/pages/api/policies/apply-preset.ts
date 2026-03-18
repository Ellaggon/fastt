import type { APIRoute } from "astro"
import { db, eq, and } from "astro:db"
import { Policy, PolicyRule, CancellationTier } from "astro:db"
import { POLICY_PRESETS } from "@/data/policy/policy-presets"

export const POST: APIRoute = async ({ request }) => {
	const { policyId, presetKey } = await request.json()
	console.log("presetKey", presetKey)

	if (!policyId || !presetKey) return new Response("Missing params", { status: 400 })

	const policy = await db.select().from(Policy).where(eq(Policy.id, policyId)).get()

	if (!policy) return new Response("Policy not found", { status: 404 })

	if (policy.status !== "draft") {
		console.log("Policy status is:", policy.status)
		return new Response("Only draft policies can be modified", { status: 400 })
	}

	const preset = Object.values(POLICY_PRESETS)
		.flat()
		.find((p) => p.key === presetKey)

	if (!preset) return new Response("Preset not found", { status: 404 })

	await db.transaction(async (tx) => {
		// 🔥 Limpieza total previa
		await tx.delete(PolicyRule).where(eq(PolicyRule.policyId, policyId))
		await tx.delete(CancellationTier).where(eq(CancellationTier.policyId, policyId))

		// =============================
		// CANCELLATION PRESETS
		// =============================

		if (presetKey.startsWith("free_")) {
			const hours = parseInt(presetKey.split("_")[1])
			const days = hours / 24

			await tx.insert(CancellationTier).values([
				{
					id: crypto.randomUUID(),
					policyId,
					daysBeforeArrival: days,
					penaltyType: "percentage",
					penaltyAmount: 0,
				},
				{
					id: crypto.randomUUID(),
					policyId,
					daysBeforeArrival: 0,
					penaltyType: "percentage",
					penaltyAmount: 100,
				},
			])
		}

		if (presetKey === "non_refundable") {
			await tx.insert(CancellationTier).values({
				id: crypto.randomUUID(),
				policyId,
				daysBeforeArrival: 999,
				penaltyType: "percentage",
				penaltyAmount: 100,
			})
		}

		// =============================
		// CHECK-IN PRESETS
		// =============================

		if (presetKey.startsWith("checkin_")) {
			const hour = presetKey.split("_")[1] + ":00"

			await tx.insert(PolicyRule).values({
				id: crypto.randomUUID(),
				policyId,
				ruleKey: "checkin",
				ruleValue: {
					from: hour,
					until: "23:59",
				},
			})
		}

		// =============================
		// FUTURO: STAY RESTRICTIONS
		// =============================

		if (presetKey === "min_2_nights") {
			await tx.insert(PolicyRule).values({
				id: crypto.randomUUID(),
				policyId,
				ruleKey: "stay_restrictions",
				ruleValue: {
					minNights: 2,
				},
			})
		}

		// =============================
		// Actualizar descripción visible
		// =============================

		await tx.update(Policy).set({ description: preset.description }).where(eq(Policy.id, policyId))
	})

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
