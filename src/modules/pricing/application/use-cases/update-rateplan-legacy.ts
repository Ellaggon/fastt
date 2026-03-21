import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"
import { randomUUID } from "node:crypto"

const ALLOWED_TYPES = [
	"percentage_discount",
	"percentage_markup",
	"fixed_adjustment",
	"override",
	"package",
] as const

export type UpdateRatePlanLegacyParams = {
	id: string
	isActive?: boolean
	name?: string
	description?: string | null
	paymentType?: string
	refundable?: boolean
	cancellationPolicyId?: string | null
	type: (typeof ALLOWED_TYPES)[number]
	value?: number
	minNights?: number
	maxNights?: number
	minAdvanceDays?: number
	maxAdvanceDays?: number
}

export async function updateRatePlanLegacy(
	deps: { repo: RatePlanCommandRepositoryPort },
	body: UpdateRatePlanLegacyParams
): Promise<Response> {
	if (!body?.id) {
		return new Response(JSON.stringify({ error: "Missing ratePlanId" }), { status: 400 })
	}

	if (!ALLOWED_TYPES.includes(body.type)) {
		return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 })
	}

	const restrictions: Array<{ type: string; value: number }> = []
	if (body.minNights && body.minNights > 1)
		restrictions.push({ type: "min_los", value: Number(body.minNights) })
	if (body.maxNights) restrictions.push({ type: "max_los", value: Number(body.maxNights) })
	if (body.minAdvanceDays && body.minAdvanceDays > 0)
		restrictions.push({ type: "min_lead_time", value: Number(body.minAdvanceDays) })
	if (body.maxAdvanceDays)
		restrictions.push({ type: "max_lead_time", value: Number(body.maxAdvanceDays) })

	const priceRule =
		body.type === "package"
			? null
			: {
					id: randomUUID(),
					ratePlanId: body.id,
					name: body.name ?? null,
					type: body.type,
					value: Number(body.value),
					priority: 10,
					isActive: true,
					createdAt: new Date(),
				}

	const result = await deps.repo.updateRatePlan({
		ratePlanId: body.id,
		isActive: Boolean(body.isActive),
		template: {
			name: String(body.name ?? ""),
			description: body.description ?? null,
			paymentType: String(body.paymentType ?? ""),
			refundable: Boolean(body.refundable),
			cancellationPolicyId: body.cancellationPolicyId ?? null,
		},
		priceRule,
		restrictions,
	})

	if (result === "not_found") {
		return new Response(JSON.stringify({ error: "RatePlan not found" }), { status: 404 })
	}

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
