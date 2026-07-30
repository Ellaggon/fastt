import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import {
	type IntegrationMappingInput,
	listProviderIntegrationMappingCatalog,
	upsertProviderIntegrationMappings,
} from "@/lib/provider-integration-operations"

const secureHeaders = {
	"Cache-Control": "private, no-store",
	"Content-Type": "application/json; charset=utf-8",
	"X-Content-Type-Options": "nosniff",
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: secureHeaders })
}

function asMappingInput(value: unknown): IntegrationMappingInput {
	const row = (value ?? {}) as Record<string, unknown>
	return {
		mappingType: String(row.mappingType ?? ""),
		localEntityType: String(row.localEntityType ?? ""),
		localEntityId: String(row.localEntityId ?? ""),
		externalEntityType: String(row.externalEntityType ?? ""),
		externalEntityId: String(row.externalEntityId ?? ""),
		externalEntityName: String(row.externalEntityName ?? "") || null,
		direction:
			row.direction === "import" || row.direction === "export" ? row.direction : "bidirectional",
		metadataJson: {
			source: row.source === "suggestion" ? "suggestion" : "user",
			confidence:
				row.confidence === "high" || row.confidence === "medium" || row.confidence === "low"
					? row.confidence
					: null,
		},
	}
}

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectionId = String(params.connectionId ?? "").trim()
		if (!connectionId) return json({ error: "CONNECTION_ID_REQUIRED" }, 400)
		if (!request.headers.get("content-type")?.includes("application/json")) {
			return json({ error: "JSON_BODY_REQUIRED" }, 415)
		}
		const body = (await request.json()) as { mappings?: unknown }
		if (!Array.isArray(body.mappings)) return json({ error: "MAPPINGS_REQUIRED" }, 400)
		const inputs = body.mappings.map(asMappingInput)
		const localCatalog = await listProviderIntegrationMappingCatalog(auth.providerId)
		const validVariantIds = new Set(localCatalog.variants.map((item) => item.id))
		const validRatePlanIds = new Set(localCatalog.ratePlans.map((item) => item.id))
		for (const input of inputs) {
			const validRoom =
				input.mappingType === "room_type" &&
				input.localEntityType === "variant" &&
				validVariantIds.has(input.localEntityId)
			const validRate =
				input.mappingType === "rate_plan" &&
				input.localEntityType === "rate_plan" &&
				validRatePlanIds.has(input.localEntityId)
			if (!validRoom && !validRate) return json({ error: "MAPPING_LOCAL_ENTITY_INVALID" }, 400)
		}
		const ids = await upsertProviderIntegrationMappings({
			providerId: auth.providerId,
			connectionId,
			inputs,
		})
		return json({ ok: true, saved: ids.length, ids })
	} catch (error) {
		if (error instanceof Response) {
			const headers = new Headers(error.headers)
			for (const [key, value] of Object.entries(secureHeaders)) headers.set(key, value)
			return new Response(error.body, { status: error.status, headers })
		}
		return json({ error: error instanceof Error ? error.message : "MAPPING_SAVE_FAILED" }, 400)
	}
}
