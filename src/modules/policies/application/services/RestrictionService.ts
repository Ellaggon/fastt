import type { RestrictionRepository } from "../../infrastructure/repositories/RestrictionRepository"
import { INCOMPATIBLE_PRESETS } from "@/data/restrictions/restrictions-presets"
import { computeRestrictionPriority } from "../../domain/restrictions/restrictions.priority"
import type {
	RestrictionContext,
	RestrictionRow,
} from "../../domain/restrictions/restrictions.types"
import type { RestrictionRuleEngine } from "../../domain/restrictions/RestrictionRuleEngine"

export class RestrictionService {
	constructor(
		private deps: {
			repo: RestrictionRepository
			engine: RestrictionRuleEngine
		}
	) {}

	// ⭐ Resolver reserva
	async resolve(ctx: RestrictionContext) {
		const rules = await this.deps.repo.loadActiveRules(ctx)

		return this.deps.engine.resolve(ctx, rules)
	}

	// ⭐ Preview UI
	async preview(ctx: RestrictionContext, newRule: RestrictionRow) {
		const existing = await this.deps.repo.loadByScope(newRule.scope, newRule.scopeId)

		const blockedDates = this.deps.engine.preview(ctx, newRule, existing)

		const conflicts = this.detectConflicts(newRule, existing)

		return { blockedDates, conflicts }
	}

	// ⭐ Crear regla con lógica centralizada
	async create(rule: RestrictionRow) {
		rule.priority = computeRestrictionPriority(rule.scope, rule.type)

		await this.deps.repo.create(rule)
	}

	async update(rule: RestrictionRow) {
		rule.priority = computeRestrictionPriority(rule.scope, rule.type)

		await this.deps.repo.update(rule)
	}

	async delete(id: string) {
		await this.deps.repo.delete(id)
	}

	// ⭐ detectar conflictos UI
	private detectConflicts(newRule: RestrictionRow, existing: RestrictionRow[]) {
		const incompatible = INCOMPATIBLE_PRESETS[newRule.type]

		if (!incompatible) return []

		return existing.filter((r) => incompatible.includes(r.type))
	}
}
