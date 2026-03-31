import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { providerV2Repository } from "@/container"
import { registerProviderV2 } from "@/modules/catalog/public"

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
			companyName: String(form.get("companyName") ?? "").trim(),
			legalName: String(form.get("legalName") ?? "").trim() || undefined,
			displayName: String(form.get("displayName") ?? "").trim() || undefined,
			contactName: String(form.get("contactName") ?? "").trim() || undefined,
			contactEmail: String(form.get("contactEmail") ?? "").trim() || undefined,
			phone: String(form.get("phone") ?? "").trim() || undefined,
			type: String(form.get("type") ?? "").trim() || undefined,
		}

		const result = await registerProviderV2(
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
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
