import { db, Restriction, and, eq, lte, gte, or } from "astro:db"
import { toISODate } from "@/shared/domain/date/date.utils"
import { mapRestrictionRow } from "../../application/mappers/restrictions.mapper"
import type {
	RestrictionContext,
	RestrictionRow,
} from "../../domain/restrictions/restrictions.types"

export class RestrictionRepository {
	async loadActiveRules(ctx: RestrictionContext): Promise<RestrictionRow[]> {
		const checkInISO = toISODate(ctx.checkIn)
		const checkOutISO = toISODate(ctx.checkOut)

		const scopeConditions = []

		if (ctx.productId) {
			scopeConditions.push(eq(Restriction.scopeId, ctx.productId))
		}

		if (ctx.variantId) {
			scopeConditions.push(eq(Restriction.scopeId, ctx.variantId))
		}

		if (ctx.ratePlanId) {
			scopeConditions.push(eq(Restriction.scopeId, ctx.ratePlanId))
		}

		if (scopeConditions.length === 0) {
			return []
		}

		const raw = await db
			.select()
			.from(Restriction)
			.where(
				and(
					eq(Restriction.isActive, true),
					lte(Restriction.startDate, checkOutISO),
					gte(Restriction.endDate, checkInISO),
					or(...scopeConditions)
				)
			)

		return raw.map(mapRestrictionRow).filter(Boolean) as RestrictionRow[]
	}

	async loadByScope(scope: string, scopeId: string) {
		const raw = await db
			.select()
			.from(Restriction)
			.where(and(eq(Restriction.scope, scope), eq(Restriction.scopeId, scopeId)))

		return raw.map(mapRestrictionRow).filter(Boolean) as RestrictionRow[]
	}

	async create(rule: RestrictionRow) {
		await db.insert(Restriction).values({
			...rule,
			startDate: toISODate(rule.startDate),
			endDate: toISODate(rule.endDate),
		})
	}

	async update(rule: RestrictionRow) {
		await db
			.update(Restriction)
			.set({
				...rule,
				startDate: toISODate(rule.startDate),
				endDate: toISODate(rule.endDate),
			})
			.where(eq(Restriction.id, rule.id))
	}

	async delete(id: string) {
		await db.delete(Restriction).where(eq(Restriction.id, id))
	}
}
