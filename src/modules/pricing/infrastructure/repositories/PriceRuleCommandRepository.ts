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
			isActive: Boolean(cmd.isActive),
			createdAt: cmd.createdAt ?? new Date(),
		})
	}

	async deleteById(ruleId: string): Promise<"ok" | "not_found"> {
		const existing = await db.select().from(PriceRule).where(eq(PriceRule.id, ruleId)).get()
		if (!existing) return "not_found"
		await db.delete(PriceRule).where(eq(PriceRule.id, ruleId))
		return "ok"
	}
}
