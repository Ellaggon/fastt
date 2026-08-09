import type { APIRoute } from "astro"

import {
	assertProviderIntegrationCertificationExecution,
	getProviderIntegrationCertificationEvidencePackage,
	providerIntegrationCertificationScenarioKeys,
	recordProviderIntegrationCertificationScenarioEvidence,
} from "@/lib/provider-integration-certification"
import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"

export const prerender = false

function certificationId(params: Record<string, string | undefined>) {
	const value = String(params.certificationId ?? "").trim()
	if (!value) throw new Error("INTEGRATION_CERTIFICATION_ID_REQUIRED")
	return value
}

export const GET: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectionId = new URL(request.url).searchParams.get("connectionId")?.trim()
		if (!connectionId) throw new Error("INTEGRATION_CONNECTION_ID_REQUIRED")
		await assertProviderIntegrationCertificationExecution({
			providerId: auth.providerId,
			connectionId,
			certificationId: certificationId(params),
			userId: auth.user.id,
		})
		const evidence = await getProviderIntegrationCertificationEvidencePackage({
			providerId: auth.providerId,
			connectionId,
			certificationId: certificationId(params),
		})
		return new Response(JSON.stringify(evidence, null, 2), {
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Content-Disposition": `attachment; filename="fastt-certification-${certificationId(params)}.json"`,
				"Cache-Control": "private, no-store",
			},
		})
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json(
			{ error: error instanceof Error ? error.message : "CERTIFICATION_EVIDENCE_FAILED" },
			{ status: 400 }
		)
	}
}

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const body = (await request.json()) as Record<string, unknown>
		const connectionId = String(body.connectionId ?? "").trim()
		const scenario = String(body.scenario ?? "").trim()
		if (!connectionId) throw new Error("INTEGRATION_CONNECTION_ID_REQUIRED")
		if (!(providerIntegrationCertificationScenarioKeys as readonly string[]).includes(scenario)) {
			throw new Error("INTEGRATION_CERTIFICATION_SCENARIO_INVALID")
		}
		const result = await recordProviderIntegrationCertificationScenarioEvidence({
			providerId: auth.providerId,
			connectionId,
			certificationId: certificationId(params),
			userId: auth.user.id,
			scenario: scenario as (typeof providerIntegrationCertificationScenarioKeys)[number],
			taskId: String(body.taskId ?? "").trim() || null,
			screenshotReference: String(body.screenshotReference ?? "").trim() || null,
			note: String(body.note ?? "").trim() || null,
		})
		return Response.json(
			{ ok: true, ...result },
			{ headers: { "Cache-Control": "private, no-store" } }
		)
	} catch (error) {
		if (error instanceof Response) return error
		return Response.json(
			{ error: error instanceof Error ? error.message : "CERTIFICATION_EVIDENCE_FAILED" },
			{ status: 400 }
		)
	}
}
