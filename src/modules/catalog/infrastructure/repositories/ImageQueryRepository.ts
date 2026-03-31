import { db, Image, inArray, eq, and } from "astro:db"
import type { ImageQueryRepositoryPort } from "../../application/ports/ImageQueryRepositoryPort"

export class ImageQueryRepository implements ImageQueryRepositoryPort {
	async getByEntityIds(entityType: string, entityIds: string[]) {
		if (!entityIds.length) return []

		return db
			.select()
			.from(Image)
			.where(and(eq(Image.entityType, entityType), inArray(Image.entityId, entityIds)))
			.all()
	}
}
