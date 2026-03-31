import type { RestrictionRow, RestrictionKey } from "./restrictions.types"
import { INCOMPATIBLE_PRESETS } from "@/data/restrictions/restrictions-presets"

export function resolveConflicts(rules: RestrictionRow[]): RestrictionRow[] {
	const active = new Map<string, RestrictionRow>()

	for (const rule of rules) {
		const key = `${rule.scope}:${rule.scopeId}:${rule.type}`

		const incompatible = INCOMPATIBLE_PRESETS[rule.type as RestrictionKey]

		if (!incompatible) {
			active.set(key, rule)
			continue
		}

		const conflict = [...active.values()].find(
			(r) =>
				r.scope === rule.scope &&
				r.scopeId === rule.scopeId &&
				incompatible.includes(r.type as RestrictionKey)
		)

		if (!conflict) {
			active.set(key, rule)
			continue
		}

		if (rule.priority < conflict.priority) {
			active.delete(`${conflict.scope}:${conflict.scopeId}:${conflict.type}`)
			active.set(key, rule)
		}
	}

	return [...active.values()]
}
