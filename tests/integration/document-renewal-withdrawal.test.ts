import { expect, it, vi } from "vitest"
import {
	db,
	eq,
	ProviderDocument,
	ProviderDocumentInspection,
	ProviderAuditLog,
	User,
} from "@/shared/infrastructure/db/compat"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { documentRenewalNotice } from "@/lib/provider-document-validity"

// Storage is outside this database lifecycle test; inspection rows are explicit fixtures.
vi.mock("@/lib/provider-document-storage", async (original) => ({
	...(await original<typeof import("@/lib/provider-document-storage")>()),
	inspectProviderDocumentPreview: async () => ({ state: "ready" }),
}))
import { reviewProviderDocument } from "@/lib/provider-documents"

it("renews without losing history and withdraws verification with a persisted audit", async () => {
	const providerId = `cert-renewal-${crypto.randomUUID()}`
	const actorUserId = crypto.randomUUID()
	const oldId = crypto.randomUUID()
	const newId = crypto.randomUUID()
	await upsertProvider({ id: providerId, accountPurpose: "internal_qa" })
	await db.insert(User).values({ id: actorUserId, email: `${actorUserId}@example.invalid` })
	const expiresAt = new Date(Date.now() + 15 * 86400000)
	await db.insert(ProviderDocument).values({
		id: oldId,
		providerId,
		type: "operating_license",
		status: "verified",
		expiresAt,
		reviewedBy: actorUserId,
		reviewNotes: "Synthetic predecessor, not a real license",
	})
	expect(documentRenewalNotice({ status: "verified", expiresAt })?.kind).toBe("due_soon")
	await db.insert(ProviderDocument).values({
		id: newId,
		providerId,
		type: "operating_license",
		status: "pending",
		replacesDocumentId: oldId,
		expiresAt: new Date(Date.now() + 365 * 86400000),
		fileUrl: "r2://synthetic-certification/not-a-real-license.pdf",
	})
	const read = (id: string) =>
		db
			.select()
			.from(ProviderDocument)
			.where(eq(ProviderDocument.id, id))
			.then((rows) => rows[0]!)
	expect((await read(oldId)).status).toBe("verified")
	await expect(
		reviewProviderDocument({ providerId, actorUserId, documentId: newId, status: "verified" })
	).rejects.toThrow("document_processing_gate_blocked")
	expect((await read(oldId)).status).toBe("verified")
	await db.insert(ProviderDocumentInspection).values({
		id: crypto.randomUUID(),
		providerId,
		documentId: newId,
		processingState: "completed",
		structuralStatus: "valid",
		malwareStatus: "clean",
		tamperStatus: "clear",
		ocrStatus: "completed",
		extractionStatus: "completed",
	})
	await reviewProviderDocument({
		providerId,
		actorUserId,
		documentId: newId,
		status: "verified",
		reviewNotes: "Synthetic renewal review",
	})
	expect((await read(oldId)).status).toBe("superseded")
	expect((await read(newId)).status).toBe("verified")
	const withdrawal = {
		providerId,
		actorUserId,
		documentId: newId,
		status: "rejected",
		withdrawVerification: true,
	}
	await expect(reviewProviderDocument({ ...withdrawal, reviewNotes: "short" })).rejects.toThrow(
		"withdrawal_reason_required"
	)
	expect((await read(newId)).status).toBe("verified")
	const reason = "Synthetic suspension for audit certification only"
	await reviewProviderDocument({ ...withdrawal, reviewNotes: reason })
	expect((await read(newId)).status).toBe("rejected")
	expect((await read(oldId)).status).toBe("superseded")
	const logs = await db.select().from(ProviderAuditLog).where(eq(ProviderAuditLog.entityId, newId))
	const audit = logs.filter((row) => row.action === "provider.document.verification_withdrawn")
	expect(audit).toHaveLength(1)
	expect(audit[0]).toMatchObject({
		actorUserId,
		beforeJson: { status: "verified" },
		afterJson: { status: "rejected", reviewNotes: reason },
	})
	await expect(reviewProviderDocument({ ...withdrawal, reviewNotes: reason })).rejects.toThrow(
		"not_pending"
	)
	expect(documentRenewalNotice(await read(newId))).toBeNull()
})
