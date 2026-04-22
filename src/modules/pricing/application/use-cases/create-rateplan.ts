import { randomUUID } from "node:crypto"
import { buildCreateRatePlanSpec } from "./build-create-rateplan-spec"
import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"

export interface CreateRatePlanDeps {
	repo: RatePlanCommandRepositoryPort
}

export async function createRatePlan(
	deps: CreateRatePlanDeps,
	body: any
): Promise<{ ok: true; ratePlanId: string } | { ok: false; status: 400; error: string }> {
	const specResult = buildCreateRatePlanSpec(body)
	if (!specResult.ok) {
		return { ok: false, status: 400, error: specResult.error.message }
	}

	const templateId = randomUUID()
	const ratePlanId = randomUUID()

	const now = new Date()

	const { restrictions } = specResult.spec

	const baseRestriction = {
		scope: "rate_plan" as const,
		scopeId: ratePlanId,
		startDate: body.startDate ? new Date(body.startDate).toISOString() : new Date().toISOString(),
		endDate: body.endDate
			? new Date(body.endDate).toISOString()
			: new Date("2099-12-31").toISOString(),
		validDays: body.validDays ?? null,
		isActive: true,
	}

	await deps.repo.createRatePlan({
		template: {
			id: templateId,
			name: body.name,
			description: body.description ?? null,
			paymentType: body.paymentType,
			refundable: Boolean(body.refundable),
			createdAt: now,
		},
		ratePlan: {
			id: ratePlanId,
			variantId: body.variantId,
			templateId,
			isDefault: Boolean(body.isDefault),
			isActive: Boolean(body.isActive),
			createdAt: now,
		},
		priceRule:
			body.type !== "package"
				? {
						id: randomUUID(),
						ratePlanId,
						name: body.name ?? null,
						type: body.type,
						value: Number(body.value),
						priority: 10,
						isActive: true,
						createdAt: now,
					}
				: undefined,
		restrictions: restrictions.items.map((item) => ({
			id: randomUUID(),
			...baseRestriction,
			type: String(item.type),
			value: item.value,
		})),
	})

	return { ok: true, ratePlanId }
}
