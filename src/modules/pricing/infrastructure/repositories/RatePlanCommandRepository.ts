import {
	and,
	CommercialRule,
	CommercialRuleApplication,
	CommercialRuleSet,
	db,
	EffectivePricingV2,
	EffectiveRestriction,
	eq,
	inArray,
	Product,
	RatePlan,
	RatePlanOccupancyPolicy,
	SearchUnitView,
	sql,
	Variant,
} from "astro:db"
import {
	createCommercialPriceRule,
	createCommercialSellabilityRule,
} from "@/lib/commercial-rules/commercialRulesRepository"
import { hasCompressedRatePlanSchema } from "@/lib/rates/ratePlanSchemaCompat"
import type {
	CreateRatePlanCommand,
	RatePlanCommandRepositoryPort,
} from "../../application/ports/RatePlanCommandRepositoryPort"

export class RatePlanCommandRepository implements RatePlanCommandRepositoryPort {
	async createRatePlan(cmd: CreateRatePlanCommand): Promise<void> {
		let providerId: string | null = null
		const compressedSchema = await hasCompressedRatePlanSchema()
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
			if (compressedSchema) {
				await tx.insert(RatePlan).values({
					id: cmd.ratePlan.id,
					variantId: cmd.ratePlan.variantId,
					name: cmd.ratePlan.name,
					description: cmd.ratePlan.description,
					isDefault: Boolean(cmd.ratePlan.isDefault),
					isActive: cmd.ratePlan.isActive,
					createdAt: cmd.ratePlan.createdAt,
				})
			} else {
				const createdAt = cmd.ratePlan.createdAt.toISOString()
				await tx.run(sql`
					insert into "RatePlanTemplate" (
						"id", "name", "description", "paymentType", "refundable", "createdAt"
					)
					values (
						${cmd.ratePlan.id},
						${cmd.ratePlan.name},
						${cmd.ratePlan.description},
						'prepaid',
						0,
						${createdAt}
					)
				`)
				await tx.run(sql`
					insert into "RatePlan" ("id", "templateId", "variantId", "isDefault", "isActive", "createdAt")
					values (
						${cmd.ratePlan.id},
						${cmd.ratePlan.id},
						${cmd.ratePlan.variantId},
						${cmd.ratePlan.isDefault ? 1 : 0},
						${cmd.ratePlan.isActive ? 1 : 0},
						${createdAt}
					)
				`)
			}
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
		isDefault?: boolean
		name: string
		description: string | null
	}): Promise<"not_found" | "ok"> {
		let notFound = false
		const compressedSchema = await hasCompressedRatePlanSchema()
		await db.transaction(async (tx) => {
			const ratePlan = await tx
				.select({
					id: RatePlan.id,
					variantId: RatePlan.variantId,
					isDefault: RatePlan.isDefault,
				})
				.from(RatePlan)
				.where(eq(RatePlan.id, params.ratePlanId))
				.get()

			if (!ratePlan) {
				notFound = true
				return
			}
			if (params.isDefault) {
				await tx
					.update(RatePlan)
					.set({ isDefault: false })
					.where(eq(RatePlan.variantId, ratePlan.variantId))
			}

			if (compressedSchema) {
				await tx
					.update(RatePlan)
					.set({
						isActive: Boolean(params.isActive),
						isDefault: params.isDefault ?? Boolean(ratePlan.isDefault),
						name: params.name,
						description: params.description ?? null,
					})
					.where(eq(RatePlan.id, params.ratePlanId))
			} else {
				await tx
					.update(RatePlan)
					.set({
						isActive: Boolean(params.isActive),
						isDefault: params.isDefault ?? Boolean(ratePlan.isDefault),
					})
					.where(eq(RatePlan.id, params.ratePlanId))
				await tx.run(sql`
					update "RatePlanTemplate"
					set "name" = ${params.name}, "description" = ${params.description}
					where "id" = (
						select "templateId" from "RatePlan" where "id" = ${params.ratePlanId}
					)
				`)
			}
		})
		return notFound ? "not_found" : "ok"
	}

	async deleteRatePlan(ratePlanId: string): Promise<"not_found" | "ok"> {
		const compressedSchema = await hasCompressedRatePlanSchema()
		const existing = await db
			.select({ id: RatePlan.id })
			.from(RatePlan)
			.where(eq(RatePlan.id, ratePlanId))
			.get()
		if (!existing) return "not_found"

		await db.transaction(async (tx) => {
			async function removeOptional<T>(run: () => Promise<T>): Promise<T | undefined> {
				try {
					return await run()
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					if (!message.includes("no such table") && !message.includes("no such column")) {
						throw error
					}
					return undefined
				}
			}
			const legacyTemplate = compressedSchema
				? null
				: await tx
						.select({ templateId: sql<string>`"RatePlan"."templateId"` })
						.from(RatePlan)
						.where(eq(RatePlan.id, ratePlanId))
						.get()
			const ruleApplications = await removeOptional(async () =>
				tx
					.select({
						id: CommercialRuleApplication.id,
						ruleId: CommercialRuleApplication.ruleId,
						ruleSetId: CommercialRuleApplication.ruleSetId,
					})
					.from(CommercialRuleApplication)
					.where(
						and(
							eq(CommercialRuleApplication.scope, "rate_plan"),
							eq(CommercialRuleApplication.scopeId, ratePlanId)
						)
					)
					.all()
			)
			if (Array.isArray(ruleApplications) && ruleApplications.length > 0) {
				const applicationIds = ruleApplications.map((row) => String(row.id))
				const ruleIds = [...new Set(ruleApplications.map((row) => String(row.ruleId)))]
				const ruleSetIds = [...new Set(ruleApplications.map((row) => String(row.ruleSetId)))]
				await tx
					.delete(CommercialRuleApplication)
					.where(inArray(CommercialRuleApplication.id, applicationIds))
				for (const ruleId of ruleIds) {
					const remaining = await tx
						.select({ id: CommercialRuleApplication.id })
						.from(CommercialRuleApplication)
						.where(eq(CommercialRuleApplication.ruleId, ruleId))
						.get()
					if (!remaining) await tx.delete(CommercialRule).where(eq(CommercialRule.id, ruleId))
				}
				for (const ruleSetId of ruleSetIds) {
					const remaining = await tx
						.select({ id: CommercialRule.id })
						.from(CommercialRule)
						.where(eq(CommercialRule.ruleSetId, ruleSetId))
						.get()
					if (!remaining) {
						await tx.delete(CommercialRuleSet).where(eq(CommercialRuleSet.id, ruleSetId))
					}
				}
			}
			await removeOptional(() =>
				tx.delete(EffectivePricingV2).where(eq(EffectivePricingV2.ratePlanId, ratePlanId))
			)
			await removeOptional(() =>
				tx.delete(EffectiveRestriction).where(eq(EffectiveRestriction.ratePlanId, ratePlanId))
			)
			await removeOptional(() =>
				tx.delete(RatePlanOccupancyPolicy).where(eq(RatePlanOccupancyPolicy.ratePlanId, ratePlanId))
			)
			await removeOptional(() =>
				tx.run(sql`delete from "PriceRule" where "ratePlanId" = ${ratePlanId}`)
			)
			await removeOptional(() =>
				tx.run(sql`delete from "RatePlanOccupancyOverride" where "ratePlanId" = ${ratePlanId}`)
			)
			await removeOptional(() =>
				tx.delete(SearchUnitView).where(eq(SearchUnitView.ratePlanId, ratePlanId))
			)
			await removeOptional(() =>
				tx.run(sql`
					delete from "PolicyAssignment"
					where "scope" = 'rate_plan' and "scopeId" = ${ratePlanId}
				`)
			)
			await removeOptional(() =>
				tx.run(sql`
					delete from "PolicyExceptionRule"
					where "scope" = 'rate_plan' and "scopeId" = ${ratePlanId}
				`)
			)
			await removeOptional(() =>
				tx.run(sql`
					delete from "TaxFeeAssignment"
					where "scope" = 'rate_plan' and "scopeId" = ${ratePlanId}
				`)
			)
			await tx.delete(RatePlan).where(eq(RatePlan.id, ratePlanId))
			if (legacyTemplate?.templateId) {
				await tx.run(sql`
					delete from "RatePlanTemplate"
					where "id" = ${legacyTemplate.templateId}
						and not exists (
							select 1 from "RatePlan" where "templateId" = ${legacyTemplate.templateId}
						)
				`)
			}
		})

		return "ok"
	}

	async purgeEffectivePricingByVariantIds(variantIds: string[]): Promise<void> {
		const ids = [...new Set(variantIds.map((id) => String(id ?? "").trim()).filter(Boolean))]
		if (!ids.length) return
		try {
			await db.delete(EffectivePricingV2).where(inArray(EffectivePricingV2.variantId, ids))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (!message.includes("no such table") && !message.includes("no such column")) {
				throw error
			}
		}
	}
}
