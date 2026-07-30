import type { APIRoute } from "astro"

import { requireProvider } from "@/lib/auth/requireProvider"
import { mapProviderIntegrationError } from "@/lib/provider-integration-errors"
import { getProviderIntegrationConnectionDiagnostics } from "@/lib/provider-integration-operations"

function dateValue(value: Date | null) {
	return value instanceof Date ? value.toISOString() : null
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const auth = await requireProvider(request)
		const connectionId = new URL(request.url).searchParams.get("connectionId")?.trim()
		if (!connectionId) {
			return Response.json({ error: "CONNECTION_ID_REQUIRED" }, { status: 400 })
		}
		const diagnostics = await getProviderIntegrationConnectionDiagnostics({
			providerId: auth.providerId,
			connectionId,
		})
		return Response.json(
			{
				credential: diagnostics.credential
					? {
							authType: String(diagnostics.credential.authType),
							tokenExpiresAt: dateValue(diagnostics.credential.tokenExpiresAt),
							lastRefreshedAt: dateValue(diagnostics.credential.lastRefreshedAt),
							active: !diagnostics.credential.revokedAt,
						}
					: null,
				mappingGroups: diagnostics.mappingGroups,
				openIncidents: diagnostics.openIncidents.map((incident) => ({
					...incident,
					severity: String(incident.severity),
					occurrenceCount: Number(incident.occurrenceCount ?? 0),
				})),
			},
			{ headers: { "Cache-Control": "private, no-store" } }
		)
	} catch (error) {
		if (error instanceof Response) return error
		const message = error instanceof Error ? error.message : "INTEGRATION_DIAGNOSTICS_ERROR"
		return Response.json({ error: mapProviderIntegrationError(message) }, { status: 400 })
	}
}
