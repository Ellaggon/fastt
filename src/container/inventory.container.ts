import { InventorySeederService } from "@/modules/inventory/public"
import { and, db, EffectiveAvailability, eq, gte, lt } from "astro:db"

import { DailyInventoryRepository } from "../modules/inventory/infrastructure/repositories/DailyInventoryRepository"
import { InventoryHoldRepository } from "../modules/inventory/infrastructure/repositories/InventoryHoldRepository"
import { InventoryRepository } from "../modules/inventory/infrastructure/repositories/InventoryRepository"
import { VariantInventoryConfigRepository } from "../modules/inventory/infrastructure/repositories/VariantInventoryConfigRepository"
import { InventoryBootstrapper } from "../modules/inventory/infrastructure/services/InventoryBootstrapper"

// ---- Infrastructure singletons ----
export const dailyInventoryRepository = new DailyInventoryRepository()
export const inventoryHoldRepository = new InventoryHoldRepository()
export const inventoryRepository = new InventoryRepository()
export const variantInventoryConfigRepository = new VariantInventoryConfigRepository()
export const inventoryBootstrapper = new InventoryBootstrapper()

// ---- Service singletons ----
export const inventorySeederService = new InventorySeederService(dailyInventoryRepository)

export async function loadEffectiveAvailabilityForValidation(params: {
	variantId: string
	from: string
	to: string
}): Promise<
	Array<{
		date: string
		totalUnits: number
		heldUnits: number
		bookedUnits: number
		availableUnits: number
		stopSell: boolean
		isSellable: boolean
	}>
> {
	const rows = await db
		.select({
			date: EffectiveAvailability.date,
			totalUnits: EffectiveAvailability.totalUnits,
			heldUnits: EffectiveAvailability.heldUnits,
			bookedUnits: EffectiveAvailability.bookedUnits,
			availableUnits: EffectiveAvailability.availableUnits,
			stopSell: EffectiveAvailability.stopSell,
			isSellable: EffectiveAvailability.isSellable,
		})
		.from(EffectiveAvailability)
		.where(
			and(
				eq(EffectiveAvailability.variantId, params.variantId),
				gte(EffectiveAvailability.date, params.from),
				lt(EffectiveAvailability.date, params.to)
			)
		)
		.all()

	return rows.map((row) => ({
		date: String(row.date),
		totalUnits: Number(row.totalUnits ?? 0),
		heldUnits: Number(row.heldUnits ?? 0),
		bookedUnits: Number(row.bookedUnits ?? 0),
		availableUnits: Number(row.availableUnits ?? 0),
		stopSell: Boolean(row.stopSell),
		isSellable: Boolean(row.isSellable),
	}))
}
