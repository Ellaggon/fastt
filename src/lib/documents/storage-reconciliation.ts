import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { getDocumentR2Client } from "@/container/shared.container"
import { documentStorageConfig } from "./storage-config"
import { db, inArray, ProviderDocument } from "@/shared/infrastructure/db/compat"

export type DocumentStorageAuditEntry = {
	objectKey: string
	byteSize: number | null
	lastModified: string | null
	state: "referenced" | "recent_unconfirmed" | "orphan_candidate" | "unknown_identity_or_age"
}

/** Read-only: an unreferenced object is not proof that deletion is safe. */
export async function auditProviderDocumentStorage(
	params: { minimumAgeHours?: number; now?: Date } = {}
) {
	const config = documentStorageConfig()
	if (!config) throw new Error("document_storage_not_configured")
	const minimumAgeHours = params.minimumAgeHours ?? 24
	if (!Number.isFinite(minimumAgeHours) || minimumAgeHours < 24)
		throw new Error("document_storage_audit_grace_must_be_at_least_24_hours")
	const cutoff = (params.now ?? new Date()).getTime() - minimumAgeHours * 60 * 60_000
	const entries: DocumentStorageAuditEntry[] = []
	let cursor: string | undefined
	const seenCursors = new Set<string>()
	do {
		const page = await getDocumentR2Client().send(
			new ListObjectsV2Command({
				Bucket: config.bucket,
				Prefix: "provider-documents/",
				MaxKeys: 500,
				ContinuationToken: cursor,
			}),
			{ abortSignal: AbortSignal.timeout(20_000) }
		)
		const objects = page.Contents ?? []
		const refs = objects.flatMap((item) => (item.Key ? [`r2-documents:${item.Key}`] : []))
		// All documentary states count, including rejected, superseded and historical evidence.
		const rows = refs.length
			? await db
					.select({ fileUrl: ProviderDocument.fileUrl })
					.from(ProviderDocument)
					.where(inArray(ProviderDocument.fileUrl, refs))
			: []
		const tracked = new Set(rows.map((row) => row.fileUrl))
		for (const object of objects) {
			if (!object.Key) continue
			const knownIdentity = /^provider-documents\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/original$/.test(
				object.Key
			)
			const modified = object.LastModified?.getTime()
			entries.push({
				objectKey: object.Key,
				byteSize: object.Size ?? null,
				lastModified:
					modified != null && Number.isFinite(modified) ? object.LastModified!.toISOString() : null,
				state: tracked.has(`r2-documents:${object.Key}`)
					? "referenced"
					: !knownIdentity || modified == null || !Number.isFinite(modified)
						? "unknown_identity_or_age"
						: modified > cutoff
							? "recent_unconfirmed"
							: "orphan_candidate",
			})
		}
		if (!page.IsTruncated) break
		cursor = page.NextContinuationToken
		if (!cursor || seenCursors.has(cursor))
			throw new Error("document_storage_audit_pagination_incomplete")
		seenCursors.add(cursor)
	} while (cursor)
	return { mode: "read-only" as const, minimumAgeHours, scanned: entries.length, entries }
}
