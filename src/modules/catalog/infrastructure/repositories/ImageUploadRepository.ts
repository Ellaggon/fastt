import { db, ImageUpload, eq, and, lt } from "astro:db"

export type ImageUploadRow = {
	id: string
	productId: string
	providerId?: string | null
	objectKey: string
	expectedContentType?: string | null
	expectedBytes?: number | null
	status: "pending" | "completed"
	createdAt: Date
	completedAt?: Date | null
}

export class ImageUploadRepository {
	async createPending(params: {
		id: string
		productId: string
		providerId?: string | null
		objectKey: string
		expectedContentType?: string | null
		expectedBytes?: number | null
		createdAt?: Date
	}): Promise<void> {
		await db.insert(ImageUpload).values({
			id: params.id,
			productId: params.productId,
			providerId: params.providerId ?? null,
			objectKey: params.objectKey,
			expectedContentType: params.expectedContentType ?? null,
			expectedBytes: params.expectedBytes ?? null,
			status: "pending",
			createdAt: params.createdAt ?? new Date(),
			completedAt: null,
		})
	}

	async getById(id: string): Promise<ImageUploadRow | null> {
		const row = await db.select().from(ImageUpload).where(eq(ImageUpload.id, id)).get()
		return (row as any) ?? null
	}

	async markCompleted(id: string): Promise<void> {
		await db
			.update(ImageUpload)
			.set({ status: "completed", completedAt: new Date() })
			.where(eq(ImageUpload.id, id))
	}

	async deleteById(id: string): Promise<void> {
		await db.delete(ImageUpload).where(eq(ImageUpload.id, id))
	}

	async countPendingByProduct(productId: string): Promise<number> {
		const rows = await db
			.select({ id: ImageUpload.id })
			.from(ImageUpload)
			.where(and(eq(ImageUpload.productId, productId), eq(ImageUpload.status, "pending")))
			.all()
		return rows.length
	}

	async listPendingOlderThan(cutoff: Date): Promise<ImageUploadRow[]> {
		return (await db
			.select()
			.from(ImageUpload)
			.where(and(eq(ImageUpload.status, "pending"), lt(ImageUpload.createdAt, cutoff)))
			.all()) as any
	}
}
