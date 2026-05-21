import { and, db, EffectiveAvailability, eq, gte, lt } from "astro:db"
import { toISODate } from "@/shared/domain/date/date.utils"
import type { InventoryRepositoryPort } from "../../application/ports/InventoryRepositoryPort"

export class InventoryRepository implements InventoryRepositoryPort {
	async getEffectiveRange(variantId: string, checkIn: Date, checkOut: Date) {
		const from = toISODate(checkIn)
		const to = toISODate(checkOut)
		const rows = await db
			.select({
				date: EffectiveAvailability.date,
				availableUnits: EffectiveAvailability.availableUnits,
			})
			.from(EffectiveAvailability)
			.where(
				and(
					eq(EffectiveAvailability.variantId, variantId),
					gte(EffectiveAvailability.date, from),
					lt(EffectiveAvailability.date, to)
				)
			)
			.all()

		return rows.map((row) => ({
			date: String(row.date),
			availableUnits: Number(row.availableUnits ?? 0),
			// Deprecated compatibility shape for the legacy SearchPipeline adapter.
			// EffectiveAvailability is physical-only; commercial blockers are loaded
			// through Restrictions/EffectiveRestriction.
			isSellable: Number(row.availableUnits ?? 0) > 0,
			stopSell: false,
		}))
	}
}
