import type { APIRoute } from "astro"
import { first, and, db, eq, ProviderDocument } from "@/shared/infrastructure/db/compat"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { writeSensitiveDataAccessEvent } from "@/lib/audit/audit-events"
import { createProviderDocumentPreviewUrl } from "@/lib/provider-document-storage"
import { requestIdFromRequest, withRequestId } from "@/lib/http/request-context"

export const GET: APIRoute = async ({ request }) => {
	const requestId = requestIdFromRequest(request)
	try {
		const url = new URL(request.url)
		const providerId = String(url.searchParams.get("providerId") ?? "").trim()
		const documentId = String(url.searchParams.get("documentId") ?? "").trim()
		const reason = String(url.searchParams.get("reason") ?? "").trim()
		if (!providerId || !documentId) {
			return new Response(JSON.stringify({ error: "providerId_and_documentId_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const principal = await requireInternalPermission(request, "sensitive_data.reveal", {
			type: "provider",
			id: providerId,
		})
		await requireRecentInternalAuthentication({ request, user: principal.user })
		if (!reason) {
			return new Response(JSON.stringify({ error: "access_reason_required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const row = await db
			.select({
				id: ProviderDocument.id,
				fileUrl: ProviderDocument.fileUrl,
				fileName: ProviderDocument.metadataJson,
			})
			.from(ProviderDocument)
			.where(and(eq(ProviderDocument.id, documentId), eq(ProviderDocument.providerId, providerId)))
			.then(first)

		if (!row?.id || !row.fileUrl) {
			return new Response(JSON.stringify({ error: "not_found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const previewUrl = await createProviderDocumentPreviewUrl({ fileUrl: row.fileUrl })
		if (!previewUrl) {
			return new Response(
				JSON.stringify({
					error: "preview_unavailable",
					fileUrl: row.fileUrl,
				}),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		await writeSensitiveDataAccessEvent({
			requestId,
			actorUserId: principal.user.id,
			providerId,
			resourceType: "ProviderDocument",
			resourceId: documentId,
			accessType: "reveal",
			reason,
			fields: ["fileUrl"],
		})

		return withRequestId(
			new Response(
				JSON.stringify({
					ok: true,
					url: previewUrl,
					expiresInSeconds: 300,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			),
			requestId
		)
	} catch (e) {
		if (e instanceof Response) return e
		const msg = e instanceof Error ? e.message : "Unknown error"
		return withRequestId(
			new Response(JSON.stringify({ error: msg }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
			requestId
		)
	}
}
