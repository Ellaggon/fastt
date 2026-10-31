import type { APIRoute } from "astro"
import { ZodError } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { createDirectDocumentUpload } from "@/lib/provider-document-storage"

export const POST: APIRoute = async ({ request }) => {
	if (request.headers.get("origin") !== new URL(request.url).origin)
		return Response.json({ error: "invalid_origin" }, { status: 403 })
	try {
		const { provider } = await requireProviderSessionSurface(request)
		if (!provider.permissions.canManageDocuments)
			return Response.json({ error: "forbidden" }, { status: 403 })
		if (Number(request.headers.get("content-length") ?? 0) > 8192)
			return Response.json({ error: "request_too_large" }, { status: 413 })
		const text = await request.text()
		if (text.length > 8192) return Response.json({ error: "request_too_large" }, { status: 413 })
		const result = await createDirectDocumentUpload(provider.providerId, JSON.parse(text))
		return Response.json(result, { headers: { "Cache-Control": "no-store" } })
	} catch (error) {
		if (error instanceof Response) return error
		const status =
			error instanceof ZodError || error instanceof SyntaxError
				? 400
				: ((error as { status?: number }).status ?? 503)
		return Response.json(
			{ error: status === 400 ? "validation_error" : "document_upload_unavailable" },
			{ status }
		)
	}
}
