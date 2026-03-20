import { AvailabilityService, InventorySeederService } from "@/modules/inventory/public"

import { DailyInventoryRepository } from "../modules/inventory/infrastructure/repositories/DailyInventoryRepository"
import { InventoryRepository } from "../modules/inventory/infrastructure/repositories/InventoryRepository"
import { InventoryBootstrapper } from "../modules/inventory/infrastructure/services/InventoryBootstrapper"
import { RecomputeInventoryService } from "../modules/inventory/infrastructure/services/RecomputeInventoryService"

// ---- Infrastructure singletons ----
export const dailyInventoryRepository = new DailyInventoryRepository()
export const inventoryRepository = new InventoryRepository()
export const inventoryBootstrapper = new InventoryBootstrapper()
export const recomputeInventoryService = new RecomputeInventoryService()

// ---- Service singletons ----
export const availabilityService = new AvailabilityService(dailyInventoryRepository)
export const inventorySeederService = new InventorySeederService(dailyInventoryRepository)
