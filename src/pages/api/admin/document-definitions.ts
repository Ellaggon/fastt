import type { APIRoute } from "astro"
import { ZodError } from "zod"
import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import { executeSensitiveCommand } from "@/lib/commands/sensitive-command"
import { idempotencyKeyFromRequest } from "@/lib/commands/command-idempotency"
import {
	createDocumentDefinitionDraft,
	transitionDocumentDefinition,
} from "@/lib/documents/document-definitions"

export const POST: APIRoute = async ({ request }) => {
	try {
		if (
			request.headers.get("sec-fetch-site") === "cross-site" ||
			(request.headers.get("origin") &&
				request.headers.get("origin") !== new URL(request.url).origin)
		)
			return Response.json({ error: "invalid_origin" }, { status: 403 })
		const form = await request.formData()
		const action = String(form.get("action"))
		if (!["create", "publish", "retire"].includes(action))
			return Response.json({ error: "invalid_action" }, { status: 422 })
		const principal = await requireInternalPermission(
			request,
			action === "create" ? "policy.edit" : "policy.publish"
		)
		await requireRecentInternalAuthentication({ request, user: principal.user })
		const payload =
			action === "create"
				? {
						key: form.get("key"),
						label: form.get("label"),
						description: form.get("description"),
						family: form.get("family"),
						capture: {
							version: 1,
							issuer: form.get("issuer"),
							issuedAt: form.get("issuedAt"),
							expiresAt: form.get("expiresAt"),
							allowedSubjectTypes: form.getAll("allowedSubjectTypes"),
							issuerCountries: [],
							requiredScopes: form.getAll("requiredScopes"),
						},
					}
				: { versionId: String(form.get("versionId") ?? "") }
		const result = await executeSensitiveCommand({
			atomic: true,
			audit: {
				requestId: crypto.randomUUID(),
				actorUserId: principal.user.id,
				action: `document_definition.${action}`,
				entityType: "DocumentDefinitionVersion",
				riskLevel: "high",
			},
			idempotency: {
				scope: `document_definition.${action}`,
				key: idempotencyKeyFromRequest(request),
				payload,
			},
			execute: async () => {
				const row =
					action === "create"
						? await createDocumentDefinitionDraft(payload)
						: await transitionDocumentDefinition(
								String(form.get("versionId") ?? ""),
								action as "publish" | "retire"
							)
				return { response: { ok: true, id: row.id }, afterJson: { id: row.id, status: row.status } }
			},
		})
		return Response.json(result.response)
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof ZodError)
			return Response.json(
				{
					error: "invalid_document_definition",
					message: "Revisa los campos y selecciona al menos un titular admitido.",
				},
				{ status: 422 }
			)
		console.error("document_definition.command_failed", error)
		return Response.json(
			{
				error: "document_definition_conflict",
				message: "No se pudo guardar. Actualiza el catálogo y revisa el estado de la versión.",
			},
			{ status: 409 }
		)
	}
}
