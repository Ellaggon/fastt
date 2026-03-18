import { RestrictionRepository } from "@/repositories/RestrictionRepository"
import { RestrictionRuleEngine } from "@/core/restrictions/RestrictionRuleEngine"

import { computeRestrictionPriority } from "@/core/restrictions/restrictions.priority"
import { INCOMPATIBLE_PRESETS } from "@/data/restrictions/restrictions-presets"

import type { RestrictionRow, RestrictionContext } from "@/core/restrictions/restrictions.types"

export class RestrictionService {
	constructor(
		private repo = new RestrictionRepository(),
		private engine = new RestrictionRuleEngine()
	) {}

	// ⭐ Resolver reserva
	async resolve(ctx: RestrictionContext) {
		const rules = await this.repo.loadActiveRules(ctx)

		return this.engine.resolve(ctx, rules)
	}

	// ⭐ Preview UI
	async preview(ctx: RestrictionContext, newRule: RestrictionRow) {
		const existing = await this.repo.loadByScope(newRule.scope, newRule.scopeId)

		const blockedDates = this.engine.preview(ctx, newRule, existing)

		const conflicts = this.detectConflicts(newRule, existing)

		return { blockedDates, conflicts }
	}

	// ⭐ Crear regla con lógica centralizada
	async create(rule: RestrictionRow) {
		rule.priority = computeRestrictionPriority(rule.scope, rule.type)

		await this.repo.create(rule)
	}

	async update(rule: RestrictionRow) {
		rule.priority = computeRestrictionPriority(rule.scope, rule.type)

		await this.repo.update(rule)
	}

	async delete(id: string) {
		await this.repo.delete(id)
	}

	// ⭐ detectar conflictos UI
	private detectConflicts(newRule: RestrictionRow, existing: RestrictionRow[]) {
		const incompatible = INCOMPATIBLE_PRESETS[newRule.type]

		if (!incompatible) return []

		return existing.filter((r) => incompatible.includes(r.type))
	}
}
