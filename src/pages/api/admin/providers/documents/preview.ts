import type { APIRoute } from "astro"
import { and, db, eq, ProviderDocument } from "astro:db"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import { createProviderDocumentPreviewUrl } from "@/lib/provider-document-storage"

export const GET: APIRoute = async ({ request }) => {
	try {
		await requireInternalAdmin(request)
		const url = new URL(request.url)
		const providerId = String(url.searchParams.get("providerId") ?? "").trim()
		const documentId = String(url.searchParams.get("documentId") ?? "").trim()
		if (!providerId || !documentId) {
			return new Response(JSON.stringify({ error: "providerId_and_documentId_required" }), {
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
			.get()

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

		return new Response(
			JSON.stringify({
				ok: true,
				url: previewUrl,
				expiresInSeconds: 300,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (e) {
		if (e instanceof Response) return e
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
