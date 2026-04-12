import type { APIRoute } from "astro"
import { providerV2Repository } from "@/container"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { ValidationError } from "@/lib/validation/ValidationError"
import { setProviderVerificationV2 } from "@/modules/catalog/public"

const ADMIN_EMAILS = ["ellaggon@proton.me"]

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
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response("Unauthorized", { status: 401 })
		}

		if (!ADMIN_EMAILS.includes(user.email)) {
			return new Response("Forbidden", { status: 403 })
		}

		const payload = await readPayload(request)
		if (!payload.providerId) {
			return new Response(JSON.stringify({ error: "providerId is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (payload.status !== "approved" && payload.status !== "rejected") {
			return new Response(JSON.stringify({ error: "status must be approved or rejected" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		if (payload.status === "rejected" && !payload.reason) {
			return new Response(JSON.stringify({ error: "reason is required when status is rejected" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await setProviderVerificationV2(
			{ repo: providerV2Repository },
			{
				providerId: payload.providerId,
				status: payload.status,
				reason: payload.reason ?? null,
				reviewedBy: user.email,
				metadataJson: null,
			}
		)
		await invalidateProvider(payload.providerId)

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ValidationError) {
			return new Response(JSON.stringify({ error: "validation_error", errors: e.errors }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
