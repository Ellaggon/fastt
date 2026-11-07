import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { readFile, open, stat } from "node:fs/promises"
import { z } from "zod"

import { assertDocumentIntegrity } from "./object-integrity"

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_SOURCE_BYTES = 40 * 1024 * 1024
const MAGIC = Buffer.from("FASTT-DOC-BACKUP-1\n")
const identity = z.string().regex(/^[a-zA-Z0-9_-]+$/)
const entrySchema = z
	.object({
		providerId: identity,
		documentId: identity,
		fileRef: z.string(),
		integrity: z
			.object({
				version: z.literal(1),
				sha256: z.string().regex(/^[a-f0-9]{64}$/),
				byteSize: z
					.number()
					.int()
					.positive()
					.max(12 * 1024 * 1024),
				declaredMimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
			})
			.strict(),
	})
	.strict()
	.superRefine((entry, ctx) => {
		if (
			entry.fileRef !==
			`r2-documents:provider-documents/${entry.providerId}/${entry.documentId}/original`
		)
			ctx.addIssue({ code: "custom", message: "non_canonical_document_reference" })
	})
export type RecoveryEntry = z.infer<typeof entrySchema>
const archiveSchema = z
	.object({
		version: z.literal(1),
		createdAt: z.iso.datetime(),
		// A correlation reference, NOT proof that a PostgreSQL backup exists.
		databaseCheckpoint: z.string().min(1).max(200),
		entries: z
			.array(z.object({ record: entrySchema, body: z.string().max(17 * 1024 * 1024) }).strict())
			.max(100),
	})
	.strict()

function validateEntries(entries: RecoveryEntry[]) {
	const ids = new Set<string>()
	for (const entry of entries) {
		entrySchema.parse(entry)
		if (ids.has(entry.documentId)) throw new Error("duplicate_document_in_archive")
		ids.add(entry.documentId)
	}
}

function validateKey(key: Buffer) {
	if (key.length !== 32) throw new Error("archive_key_must_be_32_bytes")
}

/** No deletion adapter is exposed until retention, holds and authority are approved. */
export function documentDeletionPolicy() {
	return {
		allowed: false as const,
		reason: "retention_and_deletion_authority_not_configured" as const,
	}
}

export async function writeDocumentArchive(params: {
	path: string
	key: Buffer
	databaseCheckpoint: string
	entries: RecoveryEntry[]
	readObject: (entry: RecoveryEntry) => Promise<Buffer>
}) {
	validateKey(params.key)
	validateEntries(params.entries)
	if (params.entries.reduce((sum, entry) => sum + entry.integrity.byteSize, 0) > MAX_SOURCE_BYTES)
		throw new Error("archive_batch_too_large")
	const entries = []
	for (const record of params.entries) {
		const bytes = await params.readObject(record)
		assertDocumentIntegrity(bytes, record.integrity)
		entries.push({ record, body: bytes.toString("base64") })
	}
	const payload = archiveSchema.parse({
		version: 1,
		createdAt: new Date().toISOString(),
		databaseCheckpoint: params.databaseCheckpoint,
		entries,
	})
	const nonce = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", params.key, nonce)
	cipher.setAAD(MAGIC)
	const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
	const archive = Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted])
	if (archive.length > MAX_ARCHIVE_BYTES) throw new Error("archive_batch_too_large")
	// No partial archive is published before every source has been verified; never replace a backup.
	const handle = await open(params.path, "wx", 0o600)
	try {
		await handle.writeFile(archive)
		await handle.sync()
	} finally {
		await handle.close()
	}
	return { documents: entries.length, bytes: archive.length }
}

export async function recoverDocumentArchive(params: {
	path: string
	key: Buffer
	/** Must consult current inventory AND current erasure/hold decisions, not only an old DB snapshot. */
	authorize: (entry: RecoveryEntry, databaseCheckpoint: string) => Promise<boolean>
	readCurrent: (entry: RecoveryEntry) => Promise<Buffer | null>
	/** Adapter must use create-if-absent; never unconditional PUT. */
	createIfAbsent: (entry: RecoveryEntry, bytes: Buffer) => Promise<void>
}) {
	validateKey(params.key)
	if ((await stat(params.path)).size > MAX_ARCHIVE_BYTES) throw new Error("archive_too_large")
	const archive = await readFile(params.path)
	const offset = MAGIC.length
	if (!archive.subarray(0, offset).equals(MAGIC) || archive.length < offset + 29)
		throw new Error("invalid_document_archive")
	const decipher = createDecipheriv(
		"aes-256-gcm",
		params.key,
		archive.subarray(offset, offset + 12)
	)
	decipher.setAAD(MAGIC)
	decipher.setAuthTag(archive.subarray(offset + 12, offset + 28))
	const payload = archiveSchema.parse(
		JSON.parse(
			Buffer.concat([decipher.update(archive.subarray(offset + 28)), decipher.final()]).toString(
				"utf8"
			)
		)
	)
	validateEntries(payload.entries.map(({ record }) => record))
	// Preflight the entire batch before any write. A rejected item aborts recovery.
	for (const { record, body } of payload.entries) {
		assertDocumentIntegrity(Buffer.from(body, "base64"), record.integrity)
		if (!(await params.authorize(record, payload.databaseCheckpoint)))
			throw new Error("document_recovery_not_authorized")
		const current = await params.readCurrent(record)
		if (current !== null) assertDocumentIntegrity(current, record.integrity)
	}
	let restored = 0
	let existing = 0
	for (const { record, body } of payload.entries) {
		if (!(await params.authorize(record, payload.databaseCheckpoint)))
			throw new Error("document_recovery_not_authorized")
		const current = await params.readCurrent(record)
		if (current !== null) {
			assertDocumentIntegrity(current, record.integrity)
			existing++
			continue
		}
		await params.createIfAbsent(record, Buffer.from(body, "base64"))
		const written = await params.readCurrent(record)
		if (written === null) throw new Error("document_recovery_write_not_confirmed")
		assertDocumentIntegrity(written, record.integrity)
		restored++
	}
	return { restored, existing }
}
