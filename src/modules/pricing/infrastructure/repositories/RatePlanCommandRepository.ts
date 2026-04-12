import { db, RatePlanTemplate, RatePlan, PriceRule, Restriction, eq } from "astro:db"
import type {
	CreateRatePlanCommand,
	RatePlanCommandRepositoryPort,
} from "../../application/ports/RatePlanCommandRepositoryPort"
import { randomUUID } from "node:crypto"

export class RatePlanCommandRepository implements RatePlanCommandRepositoryPort {
	async createRatePlan(cmd: CreateRatePlanCommand): Promise<void> {
		await db.transaction(async (tx) => {
			// INVARIANT:
			// A variant can have only one default rate plan.
			// If the incoming plan is default, clear previous defaults first.
			if (cmd.ratePlan.isDefault) {
				await tx
					.update(RatePlan)
					.set({ isDefault: false })
					.where(eq(RatePlan.variantId, cmd.ratePlan.variantId))
			}

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
				isDefault: Boolean(cmd.ratePlan.isDefault),
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

	async updateRatePlan(params: {
		ratePlanId: string
		isActive: boolean
		template: {
			name: string
			description: string | null
			paymentType: string
			refundable: boolean
			cancellationPolicyId: string | null
		}
		priceRule: null | {
			id: string
			ratePlanId: string
			name: string | null
			type: string
			value: number
			priority: number
			isActive: boolean
			createdAt: Date
		}
		restrictions: Array<{ type: string; value: number }>
	}): Promise<"not_found" | "ok"> {
		let notFound = false

		await db.transaction(async (tx) => {
			const ratePlan = await tx
				.select()
				.from(RatePlan)
				.where(eq(RatePlan.id, params.ratePlanId))
				.get()

			if (!ratePlan) {
				notFound = true
				return
			}

			await tx
				.update(RatePlan)
				.set({
					isActive: Boolean(params.isActive),
				})
				.where(eq(RatePlan.id, params.ratePlanId))

			await tx
				.update(RatePlanTemplate)
				.set({
					name: params.template.name,
					description: params.template.description ?? null,
					paymentType: params.template.paymentType,
					refundable: Boolean(params.template.refundable),
					cancellationPolicyId: params.template.cancellationPolicyId ?? null,
				})
				.where(eq(RatePlanTemplate.id, ratePlan.templateId))

			await tx.delete(PriceRule).where(eq(PriceRule.ratePlanId, params.ratePlanId))

			if (params.priceRule) {
				await tx.insert(PriceRule).values({
					id: params.priceRule.id || randomUUID(),
					ratePlanId: params.ratePlanId,
					name: params.priceRule.name ?? null,
					type: params.priceRule.type,
					value: Number(params.priceRule.value),
					priority: params.priceRule.priority ?? 10,
					isActive: true,
					createdAt: params.priceRule.createdAt ?? new Date(),
				})
			}

			await tx.delete(Restriction).where(eq(Restriction.scopeId, params.ratePlanId))

			const baseRestriction = {
				scope: "rate_plan" as const,
				scopeId: params.ratePlanId,
				startDate: new Date().toISOString(),
				endDate: new Date("2099-12-31").toISOString(),
				validDays: null,
				isActive: true,
			}

			for (const r of params.restrictions) {
				await tx.insert(Restriction).values({
					id: randomUUID(),
					...baseRestriction,
					type: r.type,
					value: Number(r.value),
				})
			}
		})

		return notFound ? "not_found" : "ok"
	}

	async deleteRatePlan(ratePlanId: string): Promise<"not_found" | "ok"> {
		let notFound = false

		await db.transaction(async (tx) => {
			const ratePlan = await tx.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)).get()

			if (!ratePlan) {
				notFound = true
				return
			}

			await tx.delete(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId))
			await tx.delete(Restriction).where(eq(Restriction.scopeId, ratePlanId))
			await tx.delete(RatePlan).where(eq(RatePlan.id, ratePlanId))

			if (ratePlan.templateId) {
				await tx.delete(RatePlanTemplate).where(eq(RatePlanTemplate.id, ratePlan.templateId))
			}
		})

		return notFound ? "not_found" : "ok"
	}
}
