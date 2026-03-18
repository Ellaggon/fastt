import { db, Image, inArray, eq, and } from "astro:db"

export class ImageRepository {
	async getByEntityIds(entityType: string, entityIds: string[]) {
		if (!entityIds.length) return []

		return db
			.select()
			.from(Image)
			.where(
				and(
					eq(Image.entityType, entityType),
					inArray(Image.entityId, entityIds)
				)
			)
			.all()
	}
}