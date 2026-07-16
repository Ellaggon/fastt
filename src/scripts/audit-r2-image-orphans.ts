import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { db, Image, ImageUpload } from "astro:db"
import { r2 } from "@/container/shared.container"

type R2ObjectSummary = {
	key: string
	size: number
	lastModified: string | null
}

type AuditReport = {
	bucket: string
	prefixes: string[]
	scannedObjects: number
	trackedKeys: number
	orphanObjects: R2ObjectSummary[]
}

const DEFAULT_PREFIXES = ["products/", "rooms/", "variants/"]

function parsePrefixes(): string[] {
	const raw = process.env.R2_AUDIT_PREFIXES?.trim()
	if (!raw) return DEFAULT_PREFIXES
	return raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
}

async function listR2Objects(bucket: string, prefix: string): Promise<R2ObjectSummary[]> {
	const objects: R2ObjectSummary[] = []
	let continuationToken: string | undefined

	do {
		const result = await r2.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			})
		)

		for (const item of result.Contents ?? []) {
			if (!item.Key) continue
			objects.push({
				key: item.Key,
				size: item.Size ?? 0,
				lastModified: item.LastModified?.toISOString() ?? null,
			})
		}
		continuationToken = result.NextContinuationToken
	} while (continuationToken)

	return objects
}

async function listTrackedObjectKeys(): Promise<Set<string>> {
	const [images, uploads] = await Promise.all([
		db.select({ objectKey: Image.objectKey }).from(Image).all(),
		db.select({ objectKey: ImageUpload.objectKey }).from(ImageUpload).all(),
	])

	return new Set(
		[...images, ...uploads]
			.map((row) => String(row.objectKey ?? "").trim())
			.filter((objectKey) => objectKey.length > 0)
	)
}

export default async function auditR2ImageOrphans(): Promise<void> {
	const bucket = process.env.R2_BUCKET_NAME?.trim()
	if (!bucket) throw new Error("R2_BUCKET_NAME is required")

	const prefixes = parsePrefixes()
	const trackedKeys = await listTrackedObjectKeys()
	const scanned = (
		await Promise.all(prefixes.map((prefix) => listR2Objects(bucket, prefix)))
	).flat()
	const orphanObjects = scanned.filter((item) => !trackedKeys.has(item.key))

	const report: AuditReport = {
		bucket,
		prefixes,
		scannedObjects: scanned.length,
		trackedKeys: trackedKeys.size,
		orphanObjects,
	}

	console.log(JSON.stringify(report, null, 2))
}
