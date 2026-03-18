import { db, RatePlanTemplate, RatePlan, PriceRule, Restriction } from "astro:db"
import type {
	CreateRatePlanCommand,
	RatePlanCommandRepositoryPort,
} from "../../application/ports/RatePlanCommandRepositoryPort"

export class RatePlanCommandRepository implements RatePlanCommandRepositoryPort {
	async createRatePlan(cmd: CreateRatePlanCommand): Promise<void> {
		await db.transaction(async (tx) => {
			/* ---------------- TEMPLATE ---------------- */
			await tx.insert(RatePlanTemplate).values({
				id: cmd.template.id,
				name: cmd.template.name,
				description: cmd.template.description,
				paymentType: cmd.template.paymentType,
				refundable: cmd.template.refundable,
				cancellationPolicyId: cmd.template.cancellationPolicyId,
				createdAt: cmd.template.createdAt,
			})

			/* ---------------- RATE PLAN ---------------- */
			await tx.insert(RatePlan).values({
				id: cmd.ratePlan.id,
				variantId: cmd.ratePlan.variantId,
				templateId: cmd.ratePlan.templateId,
				isActive: cmd.ratePlan.isActive,
				createdAt: cmd.ratePlan.createdAt,
			})

			/* ---------------- PRICE RULE ---------------- */
			if (cmd.priceRule) {
				await tx.insert(PriceRule).values({
					id: cmd.priceRule.id,
					ratePlanId: cmd.priceRule.ratePlanId,
					name: cmd.priceRule.name,
					type: cmd.priceRule.type,
					value: cmd.priceRule.value,
					priority: cmd.priceRule.priority,
					isActive: cmd.priceRule.isActive,
					createdAt: cmd.priceRule.createdAt,
				})
			}

			/* ---------------- RESTRICTIONS ---------------- */
			for (const r of cmd.restrictions) {
				await tx.insert(Restriction).values({
					id: r.id,
					scope: r.scope,
					scopeId: r.scopeId,
					type: r.type,
					value: r.value,
					startDate: r.startDate,
					endDate: r.endDate,
					validDays: r.validDays,
					isActive: r.isActive,
				})
			}
		})
	}
}
