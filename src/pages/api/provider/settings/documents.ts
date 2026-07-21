import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	listProviderDocuments,
	providerDocumentTypes,
	submitProviderDocument,
	validateDocumentFile,
} from "@/lib/provider-documents"
import { resolveProviderPermissions } from "@/lib/provider-permissions"
import { and, db, eq, ProviderUser } from "astro:db"

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

async function resolvePermissions(providerId: string, userId: string) {
	const link = await db
		.select({ role: ProviderUser.role, permissionsJson: ProviderUser.permissionsJson })
		.from(ProviderUser)
		.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
		.get()
	return resolveProviderPermissions({
		role: link?.role,
		permissionsJson: link?.permissionsJson,
	})
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.id) return json({ error: "unauthorized" }, 401)

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) return json({ error: "provider_not_found" }, 404)

		const documents = await listProviderDocuments(providerId)
		const permissions = await resolvePermissions(providerId, user.id)

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
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.id) return json({ error: "unauthorized" }, 401)

		const providerId = await getProviderIdFromRequest(request, user)
		if (!providerId) return json({ error: "provider_not_found" }, 404)

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

		return shouldReturnHtmlRedirect(request)
			? redirectToVerification(request, "submitted")
			: json({ ok: true, document: submitted }, 201)
	} catch (err: any) {
		if (err instanceof ZodError)
			return json({ error: "validation_error", details: err.issues }, 400)
		const status = typeof err?.status === "number" ? err.status : 400
		return json({ error: String(err?.message || "Unknown error") }, status)
	}
}
