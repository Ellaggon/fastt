import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	listProviderDocuments,
	providerDocumentTypes,
	requiredKycDocumentTypes,
	submitProviderDocument,
	validateDocumentFile,
} from "@/lib/provider-documents"
import { routes } from "@/lib/routes"

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

/** Browser form navigation must 303 back to Verificación — never dump API JSON. */
function shouldReturnHtmlRedirect(request: Request) {
	const accept = (request.headers.get("accept") ?? "").toLowerCase()
	const fetchDest = request.headers.get("sec-fetch-dest") ?? ""
	const fetchMode = request.headers.get("sec-fetch-mode") ?? ""
	const contentType = request.headers.get("content-type") ?? ""
	// Explicit JSON API clients (integration tests / fetch) keep JSON responses.
	const wantsJsonOnly = accept.includes("application/json") && !accept.includes("text/html")
	if (wantsJsonOnly) return false
	if (accept.includes("text/html")) return true
	if (fetchDest === "document" || fetchMode === "navigate") return true
	// Multipart without JSON Accept → classic form post (incl. after data-astro-reload).
	if (contentType.includes("multipart/form-data")) return true
	return false
}

function redirectAfterSubmit(request: Request, result: string, type: string) {
	const isOptional = !(requiredKycDocumentTypes as readonly string[]).includes(type as any)
	const path = isOptional
		? routes.providerSettingsVerificationDocuments()
		: routes.providerSettingsVerification()
	const target = new URL(path, request.url)
	target.searchParams.set("result", result)
	if (type) target.searchParams.set("type", type)
	// Hash is fine in Location for browsers; keep slot focus after reload.
	if (!isOptional && type) target.hash = `kyc-slot-${type}`
	return Response.redirect(target.toString(), 303)
}

function redirectAfterFormError(request: Request, errorCode: string, type?: string) {
	const rawType = String(type ?? "").trim()
	const isOptional =
		rawType.length > 0 && !(requiredKycDocumentTypes as readonly string[]).includes(rawType as any)
	const path = isOptional
		? routes.providerSettingsVerificationDocuments()
		: routes.providerSettingsVerification()
	const target = new URL(path, request.url)
	target.searchParams.set("result", "error")
	target.searchParams.set("error", errorCode)
	if (rawType) target.searchParams.set("type", rawType)
	return Response.redirect(target.toString(), 303)
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
	const preferRedirect = shouldReturnHtmlRedirect(request)
	let formTypeHint = ""
	try {
		const { user, provider } = await requireProviderSessionSurface(request)
		const providerId = provider.providerId

		const form = await request.formData()
		const action = String(form.get("action") ?? "submit")
		formTypeHint = String(form.get("type") ?? "").trim()

		// Document review is internal-admin only (/api/admin/providers/documents).
		if (action === "review") {
			if (preferRedirect) {
				return redirectAfterFormError(request, "forbidden_review", formTypeHint)
			}
			return json(
				{
					error: "forbidden",
					message:
						"La verificación de documentos la realiza el equipo interno de Fastt. Usa /admin/providers.",
				},
				403
			)
		}

		// Same gate as verification UI (session surface), before storage/DB work.
		if (!provider.permissions?.canManageDocuments) {
			if (preferRedirect) {
				return redirectAfterFormError(request, "forbidden", formTypeHint)
			}
			return json({ error: "forbidden" }, 403)
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

		return preferRedirect
			? redirectAfterSubmit(request, "submitted", parsed.type)
			: json({ ok: true, document: submitted }, 201)
	} catch (err: any) {
		if (err instanceof Response) {
			// Auth redirects/forbidden — keep as-is for API clients; form posts go back to UI.
			if (preferRedirect && err.status >= 400 && err.status < 500 && err.status !== 401) {
				const code = err.status === 403 ? "forbidden" : "upload_failed"
				return redirectAfterFormError(request, code, formTypeHint)
			}
			return err
		}
		if (preferRedirect) {
			console.error("provider.settings.documents.submit_failed", {
				type: formTypeHint || null,
				error:
					err instanceof ZodError ? "validation_error" : String(err?.message || "upload_failed"),
			})
			const code =
				err instanceof ZodError
					? "validation_error"
					: String(err?.message || "upload_failed")
							.replace(/[^a-zA-Z0-9._-]+/g, "_")
							.slice(0, 64) || "upload_failed"
			return redirectAfterFormError(request, code, formTypeHint)
		}
		if (err instanceof ZodError)
			return json({ error: "validation_error", details: err.issues }, 400)
		const status = typeof err?.status === "number" ? err.status : 400
		return json({ error: String(err?.message || "Unknown error") }, status)
	}
}
