import { and, DailyInventory, gt, lt } from "@/shared/infrastructure/db/compat"

/**
 * A future inventory row is sellable only while at least one physical unit
 * remains unreserved. Keep readiness surfaces on this same database rule.
 */
export function sellableDailyInventoryCondition() {
	return and(
		gt(DailyInventory.totalInventory, 0),
		lt(DailyInventory.reservedCount, DailyInventory.totalInventory)
	)
}
