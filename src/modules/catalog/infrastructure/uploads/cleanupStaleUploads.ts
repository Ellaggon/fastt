import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import type { ImageUploadRepository } from "../repositories/ImageUploadRepository"

export async function cleanupStaleUploads(params: {
	repo: ImageUploadRepository
	r2: S3Client
	bucket: string
	olderThanMinutes: number
}): Promise<{ checked: number; deleted: number }> {
	const cutoff = new Date(Date.now() - params.olderThanMinutes * 60_000)
	const rows = await params.repo.listPendingOlderThan(cutoff)

	let deleted = 0
	for (const row of rows as any[]) {
		try {
			// Best-effort delete; object may not exist.
			await params.r2.send(new DeleteObjectCommand({ Bucket: params.bucket, Key: row.objectKey }))
		} catch (e) {
			// swallow; DB cleanup still proceeds to prevent accumulation
		}
		try {
			await params.repo.deleteById(row.id)
		} catch (e) {
			continue
		}
		deleted++
	}

	return { checked: rows.length, deleted }
}
