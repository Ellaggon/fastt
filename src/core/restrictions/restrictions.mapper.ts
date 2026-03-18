import type {
	RestrictionRow,
	RestrictionKey,
} from "./restrictions.types"
import { isKnownRestriction } from "./restrictions.guards"

export function mapRestrictionRow(row: any): RestrictionRow | null {
	if (!isKnownRestriction(row.type)) return null

	return {
		...row,
		type: row.type as RestrictionKey,
		validDays: row.validDays ?? null,
	}
}