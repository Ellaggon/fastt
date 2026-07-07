import type { RestrictionRow, RestrictionKey } from "../../domain/restrictions/restrictions.types"
import { isKnownRestriction } from "../../domain/restrictions/restrictions.guards"

export function mapRestrictionRow(row: any): RestrictionRow | null {
	if (!isKnownRestriction(row.type)) return null

	return {
		...row,
		type: row.type as RestrictionKey,
		validDays: row.validDays ?? null,
	}
}
