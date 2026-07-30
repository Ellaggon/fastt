import type { APIRoute } from "astro"

import { requireProviderIntegrationManager } from "@/lib/provider-integration-auth"
import { buildChannelManagerMappingWorkspace } from "@/lib/provider-integration-mapping-workspace"
import {
	listProviderIntegrationMappingCatalog,
	listProviderIntegrationMappingsForConnection,
} from "@/lib/provider-integration-operations"
import { getProviderIntegrationConnectionReadModel } from "@/lib/provider-integration-read-models"
import { getProviderChannelManagerRemoteCatalog } from "@/lib/provider-integrations"

const secureHeaders = {
	"Cache-Control": "private, no-store",
	"Content-Type": "application/json; charset=utf-8",
	"X-Content-Type-Options": "nosniff",
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: secureHeaders })
}

export const GET: APIRoute = async ({ request, params }) => {
	try {
		const auth = await requireProviderIntegrationManager(request)
		const connectionId = String(params.connectionId ?? "").trim()
		if (!connectionId) return json({ error: "CONNECTION_ID_REQUIRED" }, 400)
		const url = new URL(request.url)
		const pageSize = Math.min(
			50,
			Math.max(10, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25)
		)
		const roomPage = Math.max(1, Number.parseInt(url.searchParams.get("roomPage") ?? "1", 10) || 1)
		const ratePage = Math.max(1, Number.parseInt(url.searchParams.get("ratePage") ?? "1", 10) || 1)

		const [connection, localCatalog, remoteCatalog, mappings] = await Promise.all([
			getProviderIntegrationConnectionReadModel({
				providerId: auth.providerId,
				connectionId,
			}),
			listProviderIntegrationMappingCatalog(auth.providerId),
			getProviderChannelManagerRemoteCatalog({
				providerId: auth.providerId,
				currentUserId: auth.user.id,
				connectionId,
			}),
			listProviderIntegrationMappingsForConnection({
				providerId: auth.providerId,
				connectionId,
			}),
		])
		if (!connection || connection.connectorKey !== "channel_manager") {
			return json({ error: "INTEGRATION_CONNECTION_NOT_FOUND" }, 404)
		}
		const fullWorkspace = buildChannelManagerMappingWorkspace({
			localCatalog,
			remoteCatalog,
			mappings,
		})
		const roomOffset = (roomPage - 1) * pageSize
		const rateOffset = (ratePage - 1) * pageSize
		const workspace = {
			...fullWorkspace,
			roomTypes: {
				...fullWorkspace.roomTypes,
				local: fullWorkspace.roomTypes.local.slice(roomOffset, roomOffset + pageSize),
			},
			ratePlans: {
				...fullWorkspace.ratePlans,
				local: fullWorkspace.ratePlans.local.slice(rateOffset, rateOffset + pageSize),
			},
		}

		return json({
			connection: {
				id: connection.id,
				displayName: connection.displayName,
				vendorKey: connection.vendorKey,
				mode: connection.mode,
				status: connection.status,
				externalPropertyId: connection.externalPropertyId,
			},
			workspace,
			pagination: {
				roomTypes: {
					page: roomPage,
					pageSize,
					total: fullWorkspace.roomTypes.local.length,
					hasMore: roomOffset + pageSize < fullWorkspace.roomTypes.local.length,
				},
				ratePlans: {
					page: ratePage,
					pageSize,
					total: fullWorkspace.ratePlans.local.length,
					hasMore: rateOffset + pageSize < fullWorkspace.ratePlans.local.length,
				},
			},
		})
	} catch (error) {
		if (error instanceof Response) {
			const headers = new Headers(error.headers)
			for (const [key, value] of Object.entries(secureHeaders)) headers.set(key, value)
			return new Response(error.body, { status: error.status, headers })
		}
		return json(
			{ error: error instanceof Error ? error.message : "MAPPING_WORKSPACE_UNAVAILABLE" },
			400
		)
	}
}
