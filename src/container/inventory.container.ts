import { InventorySeederService } from "@/modules/inventory/public"

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
