import type { RestrictionResult, RestrictionRow } from "../../domain/restrictions.types"

export interface RestrictionPort {
	evaluateFromMemory(ctx: {
		restrictions: RestrictionRow[]
		checkIn: Date
		checkOut: Date
		nights: number
	}): RestrictionResult
}
