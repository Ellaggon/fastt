import { ROOM_TYPES } from "@/data/room/room-types"
import { db, RoomType } from "@/shared/infrastructure/db/compat"

export default async function seedRoomTypes(): Promise<void> {
	for (const roomType of ROOM_TYPES) {
		await db
			.insert(RoomType)
			.values(roomType)
			.onConflictDoUpdate({
				target: [RoomType.id],
				set: {
					name: roomType.name,
					maxOccupancy: roomType.maxOccupancy,
					description: roomType.description,
				},
			})
	}
	console.log(`Room types ready: ${ROOM_TYPES.length}`)
}
