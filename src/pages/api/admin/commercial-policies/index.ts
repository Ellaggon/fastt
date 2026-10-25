import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { withPostgresTransaction } from "@/shared/infrastructure/db/client"
import { db, AuditEvent, CompliancePolicyVersion, eq } from "@/shared/infrastructure/db/compat"
import {
	createCommercialPolicyDraft,
	addCommercialPolicyDraftRule,
	removeCommercialPolicyDraftRule,
	retireCommercialTourPolicy,
} from "@/lib/commercial-policy/policy-drafts"
export const POST: APIRoute = async ({ request }) => {
	try {
		if (
			request.headers.get("sec-fetch-site") === "cross-site" ||
			(request.headers.get("origin") &&
				request.headers.get("origin") !== new URL(request.url).origin)
		)
			return Response.json({ error: "invalid_origin" }, { status: 403 })
		const form = await request.formData()
		const principal = await requireInternalPermission(
			request,
			form.get("action") === "retire" ? "policy.publish" : "policy.edit"
		)
		await requireRecentInternalAuthentication({ request, user: principal.user })
		await withPostgresTransaction(async () => {
			let entityId = String(form.get("versionId") ?? "")
			const [before] = entityId
				? await db
						.select()
						.from(CompliancePolicyVersion)
						.where(eq(CompliancePolicyVersion.id, entityId))
				: []
			if (form.get("action") === "create") entityId = (await createCommercialPolicyDraft(form)).id
			else if (form.get("action") === "rule") await addCommercialPolicyDraftRule(form)
			else if (form.get("action") === "remove_rule")
				await removeCommercialPolicyDraftRule(
					String(form.get("versionId") ?? ""),
					String(form.get("ruleId") ?? "")
				)
			else if (form.get("action") === "retire")
				await retireCommercialTourPolicy(String(form.get("versionId") ?? ""))
			else throw new Error("invalid_action")
			await db.insert(AuditEvent).values({
				id: crypto.randomUUID(),
				requestId: crypto.randomUUID(),
				actorUserId: principal.user.id,
				action: `commercial_policy.${String(form.get("action"))}`,
				entityType: "CompliancePolicyVersion",
				entityId,
				riskLevel: "high",
				beforeJson: before ?? null,
				afterJson: Object.fromEntries(form),
			})
		})
		return Response.json({ ok: true })
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof ZodError)
			return Response.json(
				{ error: "invalid_terms", message: "Revisa los campos obligatorios y las fechas." },
				{ status: 422 }
			)
		console.error("commercial_policy.draft_failed", error)
		return Response.json(
			{
				error: "save_failed",
				message:
					"No se pudo guardar. La versión puede estar firmada o la clave de requisito ya existe.",
			},
			{ status: 409 }
		)
	}
}
