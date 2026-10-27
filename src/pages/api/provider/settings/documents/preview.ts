import type { APIRoute } from "astro"
import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { writeSensitiveDataAccessEvent } from "@/lib/audit/audit-events"
import { assertProviderDocumentSafeToReveal } from "@/lib/documents/document-processing"
import { createProviderDocumentPreviewUrl } from "@/lib/provider-document-storage"
import { and, db, eq, first, ProviderDocument } from "@/shared/infrastructure/db/compat"
import { requestIdFromRequest } from "@/lib/http/request-context"

/** A provider can consult only its own evidence, using the existing document permission. */
export const GET: APIRoute = async ({ request }) => {
	const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
	try {
		const session = await requireProviderSessionSurface(request)
		if (!session.provider.permissions?.canManageDocuments)
			return new Response("No tienes permiso para consultar documentos.", { status: 403, headers })
		const documentId = new URL(request.url).searchParams.get("documentId")?.trim()
		if (!documentId) return new Response("Indica el documento.", { status: 400, headers })
		const providerId = session.provider.providerId
		const row = await db
			.select({ id: ProviderDocument.id, fileUrl: ProviderDocument.fileUrl })
			.from(ProviderDocument)
			.where(and(eq(ProviderDocument.id, documentId), eq(ProviderDocument.providerId, providerId)))
			.then(first)
		if (!row?.fileUrl)
			return new Response("El archivo no está disponible.", { status: 404, headers })
		await assertProviderDocumentSafeToReveal(row.id)
		const url = await createProviderDocumentPreviewUrl({ fileUrl: row.fileUrl })
		if (!url) return new Response("El archivo no está disponible.", { status: 404, headers })
		await writeSensitiveDataAccessEvent({
			requestId: requestIdFromRequest(request),
			actorUserId: session.user.id,
			providerId,
			resourceType: "ProviderDocument",
			resourceId: row.id,
			accessType: "reveal",
			reason: "Consulta del documento por su proveedor",
			fields: ["fileUrl"],
		})
		return new Response(null, { status: 303, headers: { ...headers, Location: url } })
	} catch (error) {
		if (error instanceof Response) return error
		return new Response(
			"No se pudo abrir el archivo de forma segura. Inténtalo de nuevo más tarde.",
			{ status: 503, headers }
		)
	}
}
