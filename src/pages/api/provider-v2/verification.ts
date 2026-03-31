import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { providerV2Repository } from "@/container"
import { setProviderVerificationV2 } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const raw = {
			status: String(form.get("status") ?? "").trim(),
			reason: String(form.get("reason") ?? "").trim() || undefined,
			reviewedBy: String(form.get("reviewedBy") ?? "").trim() || undefined,
			metadataJson: String(form.get("metadataJson") ?? "").trim() || undefined,
		}

		const result = await setProviderVerificationV2(
			{ repo: providerV2Repository },
			{
				sessionEmail: user.email,
				status: raw.status,
				reason: raw.reason ?? null,
				reviewedBy: raw.reviewedBy ?? null,
				metadataJson: raw.metadataJson ?? null,
			}
		)

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		const status = msg.includes("Provider not found") ? 404 : 500
		return new Response(JSON.stringify({ error: msg }), {
			status,
			headers: { "Content-Type": "application/json" },
		})
	}
}
