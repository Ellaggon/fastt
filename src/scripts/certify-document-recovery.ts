import { randomBytes } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { documentIntegrity } from "../lib/documents/object-integrity"
import {
	recoverDocumentArchive,
	writeDocumentArchive,
	type RecoveryEntry,
} from "../lib/documents/recovery-archive"

// Deliberately has no DB, R2 or dotenv imports. Only the committed synthetic fixture is read.
const directory = await mkdtemp(join(tmpdir(), "fastt-recovery-drill-"))
const key = randomBytes(32)
try {
	const bytes = Buffer.from(
		await readFile("services/document-analysis/fixtures/synthetic.pdf.b64", "utf8"),
		"base64"
	)
	const record: RecoveryEntry = {
		providerId: "synthetic-provider",
		documentId: "synthetic-document",
		fileRef: "r2-documents:provider-documents/synthetic-provider/synthetic-document/original",
		integrity: {
			...documentIntegrity(bytes, "application/pdf"),
			declaredMimeType: "application/pdf",
		},
	}
	const path = join(directory, "backup.enc")
	await writeDocumentArchive({
		path,
		key,
		databaseCheckpoint: "synthetic-only-no-database",
		entries: [record],
		readObject: async () => bytes,
	})
	const restoredPath = join(directory, "recovered.pdf")
	const result = await recoverDocumentArchive({
		path,
		key,
		authorize: async (entry) => JSON.stringify(entry) === JSON.stringify(record),
		readCurrent: async () => {
			try {
				return await readFile(restoredPath)
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
				throw error
			}
		},
		createIfAbsent: async (_entry, body) => {
			await writeFile(restoredPath, body, { flag: "wx", mode: 0o600 })
		},
	})
	if (!(await readFile(restoredPath)).equals(bytes)) throw new Error("recovery_mismatch")
	console.log(
		JSON.stringify({
			syntheticOnly: true,
			...result,
			integrityVerified: true,
			databaseRestored: false,
		})
	)
} finally {
	key.fill(0)
	await rm(directory, { recursive: true, force: true })
}
