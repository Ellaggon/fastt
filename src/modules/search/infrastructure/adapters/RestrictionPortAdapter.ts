import type { RestrictionPort } from "../../application/ports/RestrictionPort"
import type { RestrictionResult, RestrictionRow } from "../../domain/restrictions.types"

export class RestrictionPortAdapter implements RestrictionPort {
	constructor(
		private deps: {
			restrictionEngine: {
				evaluateFromMemory(ctx: {
					restrictions: RestrictionRow[]
					checkIn: Date
					checkOut: Date
					nights: number
				}): RestrictionResult
			}
		}
	) {}

	evaluateFromMemory(ctx: {
		restrictions: RestrictionRow[]
		checkIn: Date
		checkOut: Date
		nights: number
	}) {
		return this.deps.restrictionEngine.evaluateFromMemory(ctx)
	}
}
