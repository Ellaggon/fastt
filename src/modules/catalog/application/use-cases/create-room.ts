import type { RoomRepositoryPort } from "../ports/RoomRepositoryPort"
import type { InventoryBootstrapPort } from "@/modules/inventory/public"

export interface CreateRoomDeps {
	roomRepo: RoomRepositoryPort
	inventoryBootstrap: InventoryBootstrapPort
}

export async function createRoom(
	deps: CreateRoomDeps,
	params: {
		hotelId: string
		roomTypeId: string
		totalRooms: number
		hasView: string | null
		maxOccupancyOverride?: number
		bedTypes: unknown[]
		sizeM2?: number
		bathroom?: number
		hasBalcony: boolean

		name: string
		description: string | null
		currency: string
		basePrice: number

		amenityIds: string[]
		imageUrls: string[]
	}
): Promise<
	| { ok: true; hotelRoomId: string; variantId: string }
	| { ok: false; status: 404; error: "Hotel not found" }
> {
	const exists = await deps.roomRepo.hotelExistsByProductId(params.hotelId)
	if (!exists) {
		return { ok: false, status: 404, error: "Hotel not found" }
	}

	const { hotelRoomId, variantId } = await deps.roomRepo.createHotelRoom({
		hotelId: params.hotelId,
		roomTypeId: params.roomTypeId,
		totalRooms: params.totalRooms,
		hasView: params.hasView,
		maxOccupancyOverride: params.maxOccupancyOverride,
		bedType: params.bedTypes.length ? params.bedTypes : null,
		sizeM2: params.sizeM2,
		bathroom: params.bathroom,
		hasBalcony: params.hasBalcony,
		variant: {
			name: params.name,
			description: params.description,
			currency: params.currency,
			basePrice: params.basePrice,
		},
		amenityIds: params.amenityIds,
		imageUrls: params.imageUrls,
	})

	// Keep existing behavior: inventory bootstrap happens after the transactional room creation.
	await deps.inventoryBootstrap.bootstrapVariantInventory({
		variantId,
		totalInventory: params.totalRooms,
		days: 365,
	})

	return { ok: true, hotelRoomId, variantId }
}
