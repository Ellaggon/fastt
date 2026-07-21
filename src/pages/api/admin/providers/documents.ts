import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { reviewProviderDocument } from "@/lib/provider-documents"

async function readPayload(request: Request): Promise<{
	providerId: string
	documentId: string
	status: string
	reviewNotes?: string
}> {
	const contentType = (request.headers.get("content-type") || "").toLowerCase()

	if (contentType.includes("application/json")) {
		const body = (await request.json()) as Record<string, unknown>
		return {
			providerId: String(body.providerId ?? "").trim(),
			documentId: String(body.documentId ?? body.id ?? "").trim(),
			status: String(body.status ?? "").trim(),
			reviewNotes: String(body.reviewNotes ?? body.reason ?? "").trim() || undefined,
		}
	}

	const form = await request.formData()
	return {
		providerId: String(form.get("providerId") ?? "").trim(),
		documentId: String(form.get("documentId") ?? form.get("id") ?? "").trim(),
		status: String(form.get("status") ?? "").trim(),
		reviewNotes: String(form.get("reviewNotes") ?? form.get("reason") ?? "").trim() || undefined,
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user } = await requireInternalAdmin(request)
		const payload = await readPayload(request)

		if (!payload.providerId) {
			return new Response(JSON.stringify({ error: "providerId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (!payload.documentId) {
			return new Response(JSON.stringify({ error: "documentId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const document = await reviewProviderDocument({
			providerId: payload.providerId,
			actorUserId: user.id,
			documentId: payload.documentId,
			status: payload.status,
			reviewNotes: payload.reviewNotes,
		})

		await invalidateProvider(payload.providerId)

		return new Response(JSON.stringify({ ok: true, document }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof Response) return e
		const status =
			typeof (e as Error & { status?: number })?.status === "number"
				? (e as Error & { status?: number }).status!
				: 500
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
