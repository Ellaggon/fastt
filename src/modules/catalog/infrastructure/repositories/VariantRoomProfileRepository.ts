import {
	db,
	eq,
	inArray,
	RoomType,
	VariantCapacity,
	VariantInventoryConfig,
	VariantRoomBed,
	VariantRoomProfile,
} from "@/shared/infrastructure/db/compat"
import type { VariantRoomProfileRepositoryPort } from "../../application/ports/VariantRoomProfileRepositoryPort"

export class VariantRoomProfileRepository implements VariantRoomProfileRepositoryPort {
	async getByIds(ids: string[]) {
		const variantIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))]
		if (!variantIds.length) return []

		const [profiles, beds, inventoryConfigs] = await Promise.all([
			db
				.select({
					id: VariantRoomProfile.variantId,
					roomTypeId: VariantRoomProfile.roomTypeId,
					roomTypeName: RoomType.name,
					viewType: VariantRoomProfile.viewType,
					sizeM2: VariantRoomProfile.sizeM2,
					bathroomCount: VariantRoomProfile.bathroomCount,
					bathroomType: VariantRoomProfile.bathroomType,
					hasBalcony: VariantRoomProfile.hasBalcony,
					maxOccupancy: VariantCapacity.maxOccupancy,
					guestFacingNotes: VariantRoomProfile.guestFacingNotes,
				})
				.from(VariantRoomProfile)
				.leftJoin(RoomType, eq(RoomType.id, VariantRoomProfile.roomTypeId))
				.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, VariantRoomProfile.variantId))
				.where(inArray(VariantRoomProfile.variantId, variantIds)),
			db
				.select({
					variantId: VariantRoomBed.variantId,
					bedType: VariantRoomBed.bedType,
					count: VariantRoomBed.count,
					roomLabel: VariantRoomBed.roomLabel,
					sortOrder: VariantRoomBed.sortOrder,
				})
				.from(VariantRoomBed)
				.where(inArray(VariantRoomBed.variantId, variantIds)),
			db
				.select({
					variantId: VariantInventoryConfig.variantId,
					defaultTotalUnits: VariantInventoryConfig.defaultTotalUnits,
				})
				.from(VariantInventoryConfig)
				.where(inArray(VariantInventoryConfig.variantId, variantIds)),
		])
		const unitsByVariant = new Map(
			inventoryConfigs.map((config) => [
				String(config.variantId),
				Number(config.defaultTotalUnits ?? 0),
			])
		)

		const bedsByVariant = new Map<
			string,
			Array<{ id: string; count: number; roomLabel?: string }>
		>()
		for (const bed of beds) {
			const variantId = String(bed.variantId ?? "")
			const list = bedsByVariant.get(variantId) ?? []
			list.push({
				id: String(bed.bedType ?? ""),
				count: Number(bed.count ?? 1),
				roomLabel: bed.roomLabel ? String(bed.roomLabel) : undefined,
			})
			bedsByVariant.set(variantId, list)
		}

		return profiles.map((profile) => {
			const beds = bedsByVariant.get(String(profile.id)) ?? []
			return {
				id: String(profile.id),
				variantId: String(profile.id),
				roomTypeId: profile.roomTypeId ? String(profile.roomTypeId) : null,
				roomTypeName: profile.roomTypeName ? String(profile.roomTypeName) : null,
				totalRooms: unitsByVariant.get(String(profile.id)) ?? 0,
				hasView: profile.viewType ?? null,
				viewType: profile.viewType ?? null,
				bedType: beds,
				beds,
				sizeM2: profile.sizeM2 ?? null,
				bathroom: profile.bathroomCount ?? null,
				bathroomCount: profile.bathroomCount ?? null,
				bathroomType: profile.bathroomType ?? null,
				hasBalcony: profile.hasBalcony ?? null,
				maxOccupancy: profile.maxOccupancy ?? null,
				guestFacingNotes: profile.guestFacingNotes ?? null,
			}
		})
	}
}
