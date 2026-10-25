import type { APIRoute } from "astro"
import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import {
	AgreementError,
	acceptCommercialAgreement,
	requestCommercialAgreement,
	requestCommercialAgreementCorrection,
} from "@/modules/financial/commercial-agreements"

export const POST: APIRoute = async ({ request }) => {
	try {
		if (
			request.headers.get("sec-fetch-site") === "cross-site" ||
			(request.headers.get("origin") &&
				request.headers.get("origin") !== new URL(request.url).origin)
		)
			return Response.json({ error: "invalid_origin" }, { status: 403 })
		const session = await requireProviderSessionSurface(request)
		const form = await request.formData()
		if (!session.provider.permissions?.canEditProfile)
			return Response.json({ error: "forbidden" }, { status: 403 })
		const providerId = session.provider.providerId
		const action = form.get("action")
		if (action === "request") await requestCommercialAgreement(providerId, session.user.id)
		else if (action === "correction")
			await requestCommercialAgreementCorrection(
				providerId,
				String(form.get("agreementId") ?? ""),
				session.user.id,
				String(form.get("reason") ?? "")
			)
		else if (action === "accept")
			await acceptCommercialAgreement({
				providerId,
				userId: session.user.id,
				agreementId: String(form.get("agreementId") ?? ""),
				termsHash: String(form.get("termsHash") ?? ""),
				consent: form.get("consent") === "on",
			})
		else return Response.json({ error: "invalid_action" }, { status: 422 })
		await Promise.all([invalidateProvider(providerId), invalidateProviderGovernance(providerId)])
		return Response.json({ ok: true })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof AgreementError)
			return Response.json({ error: error.code }, { status: error.status })
		console.error("commercial_agreement.provider_failed", error)
		return Response.json({ error: "save_failed" }, { status: 500 })
	}
}
