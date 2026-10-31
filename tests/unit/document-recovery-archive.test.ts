import { randomBytes } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"

import { documentIntegrity } from "@/lib/documents/object-integrity"
import {
	documentDeletionPolicy,
	recoverDocumentArchive,
	writeDocumentArchive,
	type RecoveryEntry,
} from "@/lib/documents/recovery-archive"

const directories: string[] = []
afterEach(async () => {
	for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function fixture() {
	const dir = await mkdtemp(join(tmpdir(), "fastt-recovery-test-"))
	directories.push(dir)
	const path = join(dir, "snapshot.enc")
	const key = randomBytes(32)
	const bytes = Buffer.from("synthetic evidence, not a real document")
	const record: RecoveryEntry = {
		providerId: "synthetic-provider",
		documentId: "synthetic-document",
		fileRef: "r2-documents:provider-documents/synthetic-provider/synthetic-document/original",
		integrity: {
			...documentIntegrity(bytes, "application/pdf"),
			declaredMimeType: "application/pdf",
		},
	}
	await writeDocumentArchive({
		path,
		key,
		databaseCheckpoint: "synthetic-db-checkpoint",
		entries: [record],
		readObject: async () => bytes,
	})
	const objects = new Map<string, Buffer>()
	const recovery = {
		path,
		key,
		authorize: async () => true,
		readCurrent: async (entry: RecoveryEntry) => objects.get(entry.fileRef) ?? null,
		createIfAbsent: async (entry: RecoveryEntry, body: Buffer) => {
			if (objects.has(entry.fileRef)) throw new Error("already_exists")
			objects.set(entry.fileRef, body)
		},
	}
	return { path, key, record, bytes, objects, recovery }
}

test("encrypted inventory and bytes recover exactly; retry does not overwrite", async () => {
	const f = await fixture()
	expect((await readFile(f.path)).includes(Buffer.from(f.record.documentId))).toBe(false)
	expect((await stat(f.path)).mode & 0o777).toBe(0o600)
	expect(await recoverDocumentArchive(f.recovery)).toEqual({ restored: 1, existing: 0 })
	expect(f.objects.get(f.record.fileRef)).toEqual(f.bytes)
	expect(await recoverDocumentArchive(f.recovery)).toEqual({ restored: 0, existing: 1 })
})

test("wrong key and tampered ciphertext fail before writing", async () => {
	const f = await fixture()
	await expect(recoverDocumentArchive({ ...f.recovery, key: randomBytes(32) })).rejects.toThrow()
	const bytes = await readFile(f.path)
	bytes[bytes.length - 1] ^= 1
	await writeFile(f.path, bytes)
	await expect(recoverDocumentArchive(f.recovery)).rejects.toThrow()
	expect(f.objects.size).toBe(0)
})

test("current erasure/authorization denial prevents resurrection", async () => {
	const f = await fixture()
	await expect(
		recoverDocumentArchive({ ...f.recovery, authorize: async () => false })
	).rejects.toThrow("document_recovery_not_authorized")
	expect(f.objects.size).toBe(0)
	expect(documentDeletionPolicy().allowed).toBe(false)
})

test("conflicting existing object is never overwritten", async () => {
	const f = await fixture()
	f.objects.set(f.record.fileRef, Buffer.from("different"))
	await expect(recoverDocumentArchive(f.recovery)).rejects.toThrow("document_integrity_mismatch")
	expect(f.objects.get(f.record.fileRef)?.toString()).toBe("different")
})

test("failed storage writes are not reported as recovered", async () => {
	const f = await fixture()
	await expect(
		recoverDocumentArchive({ ...f.recovery, createIfAbsent: async () => {} })
	).rejects.toThrow("document_recovery_write_not_confirmed")
})

test("authorization is rechecked immediately before restoring", async () => {
	const f = await fixture()
	let checks = 0
	await expect(
		recoverDocumentArchive({ ...f.recovery, authorize: async () => ++checks === 1 })
	).rejects.toThrow("document_recovery_not_authorized")
	expect(f.objects.size).toBe(0)
})

test("backup refuses missing fingerprints, foreign references and overwriting snapshots", async () => {
	const f = await fixture()
	const params = {
		path: f.path,
		key: f.key,
		databaseCheckpoint: "checkpoint",
		entries: [f.record],
		readObject: async () => f.bytes,
	}
	await expect(writeDocumentArchive(params)).rejects.toThrow()
	await expect(
		writeDocumentArchive({
			...params,
			entries: [{ ...f.record, integrity: null } as unknown as RecoveryEntry],
		})
	).rejects.toThrow()
	await expect(
		writeDocumentArchive({ ...params, entries: [{ ...f.record, providerId: "someone-else" }] })
	).rejects.toThrow()
	await expect(
		writeDocumentArchive({ ...params, readObject: async () => Buffer.from("corrupt") })
	).rejects.toThrow("document_integrity_mismatch")
})
