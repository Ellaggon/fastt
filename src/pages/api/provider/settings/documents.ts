import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	listProviderDocuments,
	providerDocumentTypes,
	submitProviderDocument,
	validateDocumentFile,
} from "@/lib/provider-documents"

const submitSchema = z.object({
	type: z.enum([
		"government_id",
		"business_registration",
		"tax_document",
		"ownership_proof",
		"operating_license",
		"address_proof",
	]),
	fileUrl: z
		.string()
		.trim()
		.max(2000)
		.optional()
		.transform((value) => value || undefined),
	fileName: z.string().trim().max(240).optional(),
	mimeType: z.string().trim().max(120).optional(),
	sizeBytes: z.coerce.number().int().positive().optional(),
	submissionNotes: z.string().trim().max(2000).optional(),
})

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function shouldReturnHtmlRedirect(request: Request) {
	const accept = request.headers.get("accept") ?? ""
	return accept.includes("text/html")
}

function redirectToVerification(request: Request, result: string) {
	return Response.redirect(
		new URL(`/provider/settings/verification?result=${result}`, request.url),
		303
	)
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const { provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const documents = await listProviderDocuments(providerId)
		const permissions = provider.permissions

		return json({
			documents,
			documentTypes: providerDocumentTypes,
			permissions: {
				canManageDocuments: permissions.canManageDocuments,
			},
			counts: {
				total: documents.length,
				pending: documents.filter((row) => row.status === "pending").length,
				verified: documents.filter((row) => row.status === "verified").length,
				rejected: documents.filter((row) => row.status === "rejected").length,
			},
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const form = await request.formData()
		const action = String(form.get("action") ?? "submit")

		// Document review is internal-admin only (/api/admin/providers/documents).
		if (action === "review") {
			return json(
				{
					error: "forbidden",
					message:
						"La verificación de documentos la realiza el equipo interno de Fastt. Usa /admin/providers.",
				},
				403
			)
		}

		const file = form.get("file")
		const fileMeta = validateDocumentFile(file instanceof File ? file : null)
		const parsed = submitSchema.parse({
			type: form.get("type"),
			fileUrl: form.get("fileUrl") || undefined,
			fileName: form.get("fileName") || fileMeta?.fileName || undefined,
			mimeType: form.get("mimeType") || fileMeta?.mimeType || undefined,
			sizeBytes: form.get("sizeBytes") || fileMeta?.sizeBytes || undefined,
			submissionNotes: form.get("submissionNotes") || undefined,
		})

		let fileBytes: Uint8Array | null = null
		if (file instanceof File && typeof file.arrayBuffer === "function") {
			fileBytes = new Uint8Array(await file.arrayBuffer())
		}

		const submitted = await submitProviderDocument({
			providerId,
			actorUserId: user.id,
			type: parsed.type,
			fileUrl: parsed.fileUrl,
			fileName: parsed.fileName,
			mimeType: parsed.mimeType,
			sizeBytes: parsed.sizeBytes,
			submissionNotes: parsed.submissionNotes,
			fileBytes,
		})
		await invalidateProvider(providerId)
		await invalidateProviderGovernance(providerId, "provider_document_submitted")

		return shouldReturnHtmlRedirect(request)
			? redirectToVerification(request, "submitted")
			: json({ ok: true, document: submitted }, 201)
	} catch (err: any) {
		if (err instanceof Response) return err
		if (err instanceof ZodError)
			return json({ error: "validation_error", details: err.issues }, 400)
		const status = typeof err?.status === "number" ? err.status : 400
		return json({ error: String(err?.message || "Unknown error") }, status)
	}
}
