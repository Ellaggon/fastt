import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { providerV2Repository } from "@/container"
import { upsertProviderProfileV2 } from "@/modules/catalog/public"

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
			timezone: String(form.get("timezone") ?? "").trim(),
			defaultCurrency: String(form.get("defaultCurrency") ?? "").trim(),
			supportEmail: String(form.get("supportEmail") ?? "").trim() || undefined,
			supportPhone: String(form.get("supportPhone") ?? "").trim() || undefined,
		}

		const result = await upsertProviderProfileV2(
			{ repo: providerV2Repository },
			{ sessionEmail: user.email, ...raw }
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
