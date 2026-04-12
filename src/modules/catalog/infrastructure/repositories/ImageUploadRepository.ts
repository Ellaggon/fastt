import { db, ImageUpload, eq, and, lt, Image } from "astro:db"

export type ImageUploadRow = {
	id: string
	imageId: string
	objectKey: string
	status: "pending" | "completed"
	createdAt: Date
	completedAt?: Date | null
}

export class ImageUploadRepository {
	async createPending(params: {
		id: string
		imageId?: string
		objectKey: string
		createdAt?: Date
	}): Promise<void> {
		const imageId = params.imageId ?? params.id
		const base = (
			process.env.R2_PUBLIC_BASE_URL || "https://pub-de0b5a27b1424d99afa6c7b2fe2f02dc.r2.dev"
		).replace(/\/+$/, "")
		await db
			.insert(Image)
			.values({
				id: imageId,
				entityType: "pending",
				entityId: imageId,
				objectKey: params.objectKey,
				url: `${base}/${params.objectKey}`,
				order: 0,
				isPrimary: false,
			})
			.onConflictDoUpdate({
				target: [Image.id],
				set: {
					entityType: "pending",
					entityId: imageId,
					objectKey: params.objectKey,
					url: `${base}/${params.objectKey}`,
				},
			})

		await db.insert(ImageUpload).values({
			id: params.id,
			imageId,
			objectKey: params.objectKey,
			status: "pending",
			createdAt: params.createdAt ?? new Date(),
			completedAt: null,
		})
	}

	async getById(id: string): Promise<ImageUploadRow | null> {
		const row = await db.select().from(ImageUpload).where(eq(ImageUpload.id, id)).get()
		const normalized = (row as any) ?? null
		if (normalized) {
			if (!normalized.imageId) {
				normalized.imageId = String(normalized.id)
			}
		}
		return normalized
	}

	async markCompleted(id: string, objectKey?: string): Promise<void> {
		await db
			.update(ImageUpload)
			.set({
				status: "completed",
				completedAt: new Date(),
				objectKey: objectKey ?? undefined,
			})
			.where(eq(ImageUpload.id, id))
	}

	async deleteById(id: string): Promise<void> {
		await db.delete(ImageUpload).where(eq(ImageUpload.id, id))
	}

	async countPendingByObjectKeyPrefix(prefix: string): Promise<number> {
		const rows = await db
			.select({ id: ImageUpload.id, objectKey: ImageUpload.objectKey })
			.from(ImageUpload)
			.where(eq(ImageUpload.status, "pending"))
			.all()
		return rows.filter((row: any) => String(row.objectKey ?? "").startsWith(prefix)).length
	}

	async listPendingOlderThan(cutoff: Date): Promise<ImageUploadRow[]> {
		return (await db
			.select()
			.from(ImageUpload)
			.where(and(eq(ImageUpload.status, "pending"), lt(ImageUpload.createdAt, cutoff)))
			.all()) as any
	}
}
