import type { APIRoute } from "astro"
import { getFeatureFlag } from "@/config/featureFlags"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { synchronizeComplianceCase } from "@/lib/casework/compliance-casework"
import { providerDocumentTypes } from "@/lib/provider-documents"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { and, db, eq, Provider, ProviderDocument } from "@/shared/infrastructure/db/compat"

export const POST: APIRoute = async ({ request }) => {
	try {
		if (request.headers.get("origin") !== new URL(request.url).origin)
			return Response.json({ error: "forbidden" }, { status: 403 })
		if (!getFeatureFlag("COMMAND_CENTER_V2_COMMANDS_ENABLED", { request }))
			return Response.json({ error: "casework_commands_disabled" }, { status: 503 })
		const form = await request.formData()
		const providerId = String(form.get("providerId") ?? "")
		const documentId = String(form.get("documentId") ?? "")
		const principal = await requireInternalPermission(request, "case.decision.propose")
		await requireInternalPermission(request, "provider.document.review", {
			type: "provider",
			id: providerId,
		})
		await requireRecentInternalAuthentication({ request, user: principal.user })
		const result = await withPostgresTransaction(async () => {
			const [document] = await db
				.select({
					status: ProviderDocument.status,
					type: ProviderDocument.type,
					providerStatus: Provider.status,
				})
				.from(ProviderDocument)
				.innerJoin(Provider, eq(Provider.id, ProviderDocument.providerId))
				.where(
					and(eq(ProviderDocument.id, documentId), eq(ProviderDocument.providerId, providerId))
				)
				.for("update")
			if (!document || document.providerStatus === "archived" || document.status !== "pending")
				return null
			const label = providerDocumentTypes.find(({ value }) => value === document.type)?.label
			return synchronizeComplianceCase({
				providerId,
				domain: "documents",
				sourceType: "ProviderDocument",
				sourceRef: documentId,
				summary: label ? `Revisión documental: ${label}` : "Revisión documental",
			})
		})
		if (!result) return Response.json({ error: "document_review_not_pending" }, { status: 409 })
		return Response.json({
			ok: true,
			redirectTo: `/admin/cases/${encodeURIComponent(result.caseId)}`,
		})
	} catch (error) {
		if (error instanceof Response) return error
		console.error("Could not start document review", error)
		return Response.json({ error: "document_review_start_failed" }, { status: 500 })
	}
}
