import { describe, expect, it } from "vitest"
import { db, eq, ProviderAuditLog, ProviderDocument, ProviderUser, User } from "astro:db"
import {
	GET as documentsGet,
	POST as documentsPost,
} from "@/pages/api/provider/settings/documents"
import { GET as settingsSummaryGet } from "@/pages/api/provider/settings/summary"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevFetch = globalThis.fetch

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response("fetch not mocked", { status: 500 })

		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })

		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return fn().finally(() => {
		globalThis.fetch = prevFetch
		if (prevUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = prevUrl
		if (prevAnon === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = prevAnon
	})
}

function makeAuthedRequest(path: string, token: string, body?: FormData): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

describe("provider compliance documents", () => {
	it("lets an owner submit and review a provider document with audit trail", async () => {
		const providerId = "provider_documents_flow"
		const token = "t_documents_owner"
		const ownerEmail = "documents.owner@example.com"
		const ownerId = `user_${ownerEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Documentos Config S.R.L.",
			displayName: "Documentos Config",
			ownerEmail,
		})

		await withSupabaseAuthStub({ [token]: { id: ownerId, email: ownerEmail } }, async () => {
			const submitBody = new FormData()
			submitBody.set("type", "business_registration")
			submitBody.set("fileUrl", "https://cdn.example.com/registro-mercantil.pdf")
			submitBody.set("fileName", "registro-mercantil.pdf")
			submitBody.set("mimeType", "application/pdf")
			submitBody.set("sizeBytes", "2048")
			submitBody.set("submissionNotes", "Registro vigente 2026")

			const submitRes = await documentsPost({
				request: makeAuthedRequest("/api/provider/settings/documents", token, submitBody),
			} as any)
			expect(submitRes.status).toBe(201)
			const submitted = await submitRes.json()
			expect(submitted.document.status).toBe("pending")
			expect(submitted.document.type).toBe("business_registration")
			expect(submitted.document.fileName).toBe("registro-mercantil.pdf")

			const listRes = await documentsGet({
				request: makeAuthedRequest("/api/provider/settings/documents", token),
			} as any)
			expect(listRes.status).toBe(200)
			const listed = await listRes.json()
			expect(listed.counts.pending).toBe(1)
			expect(listed.documents[0].id).toBe(submitted.document.id)

			const reviewBody = new FormData()
			reviewBody.set("action", "review")
			reviewBody.set("id", submitted.document.id)
			reviewBody.set("status", "verified")
			reviewBody.set("reviewNotes", "Documento legible y vigente")

			const reviewRes = await documentsPost({
				request: makeAuthedRequest("/api/provider/settings/documents", token, reviewBody),
			} as any)
			expect(reviewRes.status).toBe(200)
			const reviewed = await reviewRes.json()
			expect(reviewed.document.status).toBe("verified")
			expect(reviewed.document.reviewNotes).toBe("Documento legible y vigente")

			const persisted = await db
				.select({
					status: ProviderDocument.status,
					reviewNotes: ProviderDocument.reviewNotes,
					reviewedBy: ProviderDocument.reviewedBy,
				})
				.from(ProviderDocument)
				.where(eq(ProviderDocument.id, submitted.document.id))
				.get()
			expect(persisted?.status).toBe("verified")
			expect(persisted?.reviewNotes).toBe("Documento legible y vigente")
			expect(persisted?.reviewedBy).toBe(ownerId)

			const audit = await db
				.select({
					action: ProviderAuditLog.action,
					beforeJson: ProviderAuditLog.beforeJson,
					afterJson: ProviderAuditLog.afterJson,
				})
				.from(ProviderAuditLog)
				.where(eq(ProviderAuditLog.providerId, providerId))
				.all()
			expect(audit.some((row) => row.action === "provider.document.submit")).toBe(true)
			expect(audit.some((row) => row.action === "provider.document.review")).toBe(true)
			const reviewAudit = audit.find((row) => row.action === "provider.document.review")
			expect(reviewAudit?.beforeJson).toMatchObject({ status: "pending" })
			expect(reviewAudit?.afterJson).toMatchObject({ status: "verified" })

			const summaryRes = await settingsSummaryGet({
				request: makeAuthedRequest("/api/provider/settings/summary", token),
			} as any)
			expect(summaryRes.status).toBe(200)
			const summary = await summaryRes.json()
			expect(summary.permissions.canManageDocuments).toBe(true)
			expect(summary.documents.some((doc: any) => doc.id === submitted.document.id)).toBe(true)
			expect(summary.documents.find((doc: any) => doc.id === submitted.document.id).status).toBe(
				"verified"
			)
		})
	})

	it("rejects document management for staff without document permission", async () => {
		const providerId = "provider_documents_staff"
		const token = "t_documents_staff"
		const staffEmail = "documents.staff@example.com"
		const staffId = `user_${staffEmail}`
		const now = new Date()

		await upsertProvider({
			id: providerId,
			legalName: "Staff Docs S.R.L.",
			displayName: "Staff Docs",
			ownerEmail: "documents.owner.staffcase@example.com",
		})
		await db.insert(User).values({
			id: staffId,
			email: staffEmail,
			username: "documents_staff",
			registrationDate: now,
		})
		await db.insert(ProviderUser).values({
			providerId,
			userId: staffId,
			role: "staff",
			createdAt: now,
		})

		await withSupabaseAuthStub({ [token]: { id: staffId, email: staffEmail } }, async () => {
			const body = new FormData()
			body.set("type", "tax_document")
			body.set("fileName", "w9.pdf")
			body.set("mimeType", "application/pdf")

			const res = await documentsPost({
				request: makeAuthedRequest("/api/provider/settings/documents", token, body),
			} as any)
			expect(res.status).toBe(403)
			const payload = await res.json()
			expect(payload.error).toBe("forbidden")
		})
	})

	it("requires review notes when rejecting a document", async () => {
		const providerId = "provider_documents_reject"
		const token = "t_documents_reject"
		const ownerEmail = "documents.reject@example.com"
		const ownerId = `user_${ownerEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Reject Docs S.R.L.",
			displayName: "Reject Docs",
			ownerEmail,
		})

		await withSupabaseAuthStub({ [token]: { id: ownerId, email: ownerEmail } }, async () => {
			const submitBody = new FormData()
			submitBody.set("type", "government_id")
			submitBody.set("fileName", "pasaporte.jpg")
			submitBody.set("mimeType", "image/jpeg")
			submitBody.set("sizeBytes", "1024")

			const submitRes = await documentsPost({
				request: makeAuthedRequest("/api/provider/settings/documents", token, submitBody),
			} as any)
			const submitted = await submitRes.json()

			const rejectBody = new FormData()
			rejectBody.set("action", "review")
			rejectBody.set("id", submitted.document.id)
			rejectBody.set("status", "rejected")

			const rejectRes = await documentsPost({
				request: makeAuthedRequest("/api/provider/settings/documents", token, rejectBody),
			} as any)
			expect(rejectRes.status).toBe(400)
			const payload = await rejectRes.json()
			expect(payload.error).toBe("review_notes_required")
		})
	})
})
