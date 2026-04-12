import { db, PriceRule, eq } from "astro:db"
import type {
	CreatePriceRuleCommand,
	PriceRuleCommandRepositoryPort,
} from "../../application/ports/PriceRuleCommandRepositoryPort"

export class PriceRuleCommandRepository implements PriceRuleCommandRepositoryPort {
	async create(cmd: CreatePriceRuleCommand): Promise<void> {
		await db.insert(PriceRule).values({
			id: cmd.id,
			ratePlanId: cmd.ratePlanId,
			name: cmd.name ?? null,
			type: cmd.type,
			value: cmd.value,
			priority: cmd.priority ?? 10,
			dateRangeJson: cmd.dateRangeJson ?? null,
			dayOfWeekJson: cmd.dayOfWeekJson ?? null,
			isActive: Boolean(cmd.isActive),
			createdAt: cmd.createdAt ?? new Date(),
		})
	}

	async updateById(
		ruleId: string,
		patch: {
			name?: string | null
			type: string
			value: number
			priority: number
			dateRangeJson?: { from?: string | null; to?: string | null } | null
			dayOfWeekJson?: number[] | null
		}
	): Promise<"ok" | "not_found"> {
		const existing = await db.select().from(PriceRule).where(eq(PriceRule.id, ruleId)).get()
		if (!existing) return "not_found"
		await db
			.update(PriceRule)
			.set({
				name: patch.name ?? null,
				type: patch.type,
				value: patch.value,
				priority: patch.priority,
				dateRangeJson: patch.dateRangeJson ?? null,
				dayOfWeekJson: patch.dayOfWeekJson ?? null,
			})
			.where(eq(PriceRule.id, ruleId))
		return "ok"
	}

	async deleteById(ruleId: string): Promise<"ok" | "not_found"> {
		const existing = await db.select().from(PriceRule).where(eq(PriceRule.id, ruleId)).get()
		if (!existing) return "not_found"
		await db.delete(PriceRule).where(eq(PriceRule.id, ruleId))
		return "ok"
	}
}
