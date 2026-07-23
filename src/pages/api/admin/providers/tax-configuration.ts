import type { APIRoute } from "astro"

import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { reviewProviderTaxConfiguration } from "@/lib/provider-tax-configuration"

async function readPayload(request: Request): Promise<{
	providerId: string
	status: string
	reason?: string
}> {
	const contentType = (request.headers.get("content-type") || "").toLowerCase()

	if (contentType.includes("application/json")) {
		const body = (await request.json()) as Record<string, unknown>
		return {
			providerId: String(body.providerId ?? "").trim(),
			status: String(body.status ?? "").trim(),
			reason: String(body.reason ?? "").trim() || undefined,
		}
	}

	const form = await request.formData()
	return {
		providerId: String(form.get("providerId") ?? "").trim(),
		status: String(form.get("status") ?? "").trim(),
		reason: String(form.get("reason") ?? "").trim() || undefined,
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

		const taxConfiguration = await reviewProviderTaxConfiguration({
			providerId: payload.providerId,
			actorUserId: user.id,
			status: payload.status,
			reason: payload.reason,
		})

		await invalidateProvider(payload.providerId)
		await invalidateProviderGovernance(payload.providerId, "admin_tax_configuration_reviewed")

		return new Response(JSON.stringify({ ok: true, taxConfiguration }), {
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
