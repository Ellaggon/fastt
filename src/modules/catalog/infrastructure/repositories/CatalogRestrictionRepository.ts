import {
	db,
	eq,
	and,
	or,
	desc,
	Restriction,
	Variant,
	RatePlan,
	lte,
	gte,
	ne,
	RatePlanTemplate,
} from "astro:db"
import type { CatalogRestrictionRepositoryPort } from "../../application/ports/CatalogRestrictionRepositoryPort"

export class CatalogRestrictionRepository implements CatalogRestrictionRepositoryPort {
	async listRestrictionsByProduct(productId: string): Promise<unknown[]> {
		const rows = await db
			.select()
			.from(Restriction)
			.leftJoin(RatePlan, eq(Restriction.scopeId, RatePlan.id))
			.leftJoin(Variant, eq(RatePlan.variantId, Variant.id))
			.where(
				or(
					and(eq(Restriction.scope, "product"), eq(Restriction.scopeId, productId)),
					and(eq(Restriction.scope, "variant"), eq(Variant.productId, productId)),
					and(eq(Restriction.scope, "rate_plan"), eq(Variant.productId, productId))
				)
			)
			.orderBy(desc(Restriction.priority))

		return rows.map((row) => row.Restriction)
	}

	async listRestrictionRooms(productId: string) {
		return db
			.select({
				id: Variant.id,
				name: Variant.name,
			})
			.from(Variant)
			.where(eq(Variant.productId, productId))
			.all()
	}

	async listRestrictionRatePlans(productId: string) {
		return db
			.select({
				id: RatePlan.id,
				name: RatePlanTemplate.name,
			})
			.from(RatePlan)
			.innerJoin(RatePlanTemplate, eq(RatePlan.templateId, RatePlanTemplate.id))
			.innerJoin(Variant, eq(RatePlan.variantId, Variant.id))
			.where(eq(Variant.productId, productId))
			.all()
	}

	async findOverlap(params: {
		scope: unknown
		scopeId: unknown
		type: unknown
		startDateISO: string
		endDateISO: string
		excludeId?: string
	}): Promise<boolean> {
		const whereParts = [
			eq(Restriction.scope as any, params.scope as any),
			eq(Restriction.scopeId as any, params.scopeId as any),
			eq(Restriction.type as any, params.type as any),
			lte(Restriction.startDate, params.endDateISO),
			gte(Restriction.endDate, params.startDateISO),
		]

		if (params.excludeId) {
			whereParts.push(ne(Restriction.id, params.excludeId))
		}

		const overlap = await db
			.select()
			.from(Restriction)
			.where(and(...(whereParts as any)))
		return overlap.length > 0
	}

	async createRestriction(params: {
		id: string
		scope: unknown
		scopeId: unknown
		type: unknown
		value: unknown
		startDateISO: string
		endDateISO: string
		validDays: unknown
		isActive: boolean
		priority: number
	}): Promise<void> {
		await db.insert(Restriction).values({
			id: params.id,
			scope: params.scope as any,
			scopeId: params.scopeId as any,
			type: params.type as any,
			value: params.value as any,
			startDate: params.startDateISO,
			endDate: params.endDateISO,
			validDays: params.validDays as any,
			isActive: params.isActive,
			priority: params.priority,
		})
	}

	async updateRestriction(params: {
		ruleId: string
		patch: Record<string, unknown>
	}): Promise<void> {
		await db
			.update(Restriction)
			.set(params.patch as any)
			.where(eq(Restriction.id, params.ruleId))
	}

	async deleteRestriction(ruleId: string): Promise<void> {
		await db.delete(Restriction).where(eq(Restriction.id, ruleId))
	}
}
