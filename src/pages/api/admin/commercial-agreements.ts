import type { APIRoute } from "astro"
import { commercialAgreementRollout } from "@/modules/financial/commercial-agreement-rollout"
import { ZodError } from "zod"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	AgreementError,
	offerCommercialAgreement,
	withdrawCommercialAgreement,
} from "@/modules/financial/commercial-agreements"

export const POST: APIRoute = async ({ request }) => {
	try {
		if (
			request.headers.get("sec-fetch-site") === "cross-site" ||
			(request.headers.get("origin") &&
				request.headers.get("origin") !== new URL(request.url).origin)
		)
			return Response.json({ error: "invalid_origin" }, { status: 403 })
		const form = await request.formData()
		const providerId = String(form.get("providerId") ?? "")
		const principal = await requireInternalPermission(
			request,
			"commercial_policy.finance.approve",
			{ type: "provider", id: providerId }
		)
		await requireRecentInternalAuthentication({ request, user: principal.user })
		if (!commercialAgreementRollout(providerId).enabled)
			return Response.json({ error: "commercial_agreements_disabled" }, { status: 404 })
		const agreementId = String(form.get("agreementId") ?? "")
		if (form.get("action") === "withdraw")
			await withdrawCommercialAgreement(providerId, agreementId, principal.user.id)
		else if (form.get("action") === "offer")
			await offerCommercialAgreement({
				providerId,
				agreementId,
				actorUserId: principal.user.id,
				signerUserId: String(form.get("signerUserId") ?? ""),
				representationReference: String(form.get("representationReference") ?? ""),
				terms: Object.fromEntries(form),
			})
		else return Response.json({ error: "invalid_action" }, { status: 422 })
		await Promise.all([invalidateProvider(providerId), invalidateProviderGovernance(providerId)])
		return Response.json({ ok: true })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof AgreementError)
			return Response.json({ error: error.code }, { status: error.status })
		if (error instanceof ZodError)
			return Response.json(
				{
					error: "invalid_terms",
					message: "Revisa los campos obligatorios y la vigencia de la propuesta.",
					fieldErrors: Object.fromEntries(
						error.issues.map((issue) => [
							String(issue.path[0]),
							"Revisa este valor y las fechas del acuerdo.",
						])
					),
				},
				{ status: 422 }
			)
		console.error("commercial_agreement.admin_failed", error)
		return Response.json({ error: "save_failed" }, { status: 500 })
	}
}
