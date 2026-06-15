import { db, Product, RatePlan, Variant, eq } from "astro:db"
import {
	createCommercialPriceRule,
	createCommercialSellabilityRule,
	deleteCommercialRulesForScope,
} from "@/lib/commercial-rules/commercialRulesRepository"
import type {
	CreateRatePlanCommand,
	RatePlanCommandRepositoryPort,
} from "../../application/ports/RatePlanCommandRepositoryPort"

export class RatePlanCommandRepository implements RatePlanCommandRepositoryPort {
	async createRatePlan(cmd: CreateRatePlanCommand): Promise<void> {
		let providerId: string | null = null
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

			/* ---------------- RATE PLAN ---------------- */
			await tx.insert(RatePlan).values({
				id: cmd.ratePlan.id,
				variantId: cmd.ratePlan.variantId,
				name: cmd.ratePlan.name,
				description: cmd.ratePlan.description,
				isDefault: Boolean(cmd.ratePlan.isDefault),
				isActive: cmd.ratePlan.isActive,
				createdAt: cmd.ratePlan.createdAt,
			})
		})
		const owner = await db
			.select({ providerId: Product.providerId })
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(RatePlan.id, cmd.ratePlan.id))
			.get()
		providerId = owner?.providerId ? String(owner.providerId) : null
		if (!providerId) return
		if (cmd.priceRule) {
			await createCommercialPriceRule({
				providerId,
				ratePlanId: cmd.priceRule.ratePlanId,
				name: cmd.priceRule.name,
				type: cmd.priceRule.type,
				value: cmd.priceRule.value,
				priority: cmd.priceRule.priority,
			})
		}
		for (const r of cmd.restrictions) {
			await createCommercialSellabilityRule({
				providerId,
				scope: r.scope,
				scopeId: r.scopeId,
				type: r.type,
				value: r.value,
				startDate: r.startDate,
				endDate: r.endDate,
				validDays: Array.isArray(r.validDays) ? r.validDays : [],
			})
		}
	}

	async updateRatePlan(params: {
		ratePlanId: string
		isActive: boolean
		name: string
		description: string | null
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

		let providerId: string | null = null
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
					name: params.name,
					description: params.description ?? null,
				})
				.where(eq(RatePlan.id, params.ratePlanId))
		})
		const owner = await db
			.select({ providerId: Product.providerId })
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(RatePlan.id, params.ratePlanId))
			.get()
		providerId = owner?.providerId ? String(owner.providerId) : null
		if (!notFound && providerId) {
			await deleteCommercialRulesForScope({ scope: "rate_plan", scopeId: params.ratePlanId })
			if (params.priceRule) {
				await createCommercialPriceRule({
					providerId,
					ratePlanId: params.ratePlanId,
					name: params.priceRule.name ?? null,
					type: params.priceRule.type,
					value: Number(params.priceRule.value),
					priority: params.priceRule.priority ?? 10,
				})
			}
			for (const r of params.restrictions) {
				await createCommercialSellabilityRule({
					providerId,
					scope: "rate_plan",
					scopeId: params.ratePlanId,
					type: r.type,
					value: Number(r.value),
					startDate: new Date().toISOString().slice(0, 10),
					endDate: "2099-12-31",
					validDays: [],
				})
			}
		}

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

			await deleteCommercialRulesForScope({ scope: "rate_plan", scopeId: ratePlanId })
			await tx.delete(RatePlan).where(eq(RatePlan.id, ratePlanId))
		})

		return notFound ? "not_found" : "ok"
	}
}
