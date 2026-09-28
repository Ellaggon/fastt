import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import {
	commercialLineCollectionModels,
	commercialLines,
	declareProviderCommercialLineCollectionModel,
	listProviderCommercialLines,
} from "@/lib/verification/commercial-lines"

function target(request: Request, formTarget: string, result: string) {
	const fallback = new URL("/provider/settings/verification", request.url)
	fallback.searchParams.set(result === "saved" ? "result" : "error", `line_collection_${result}`)
	if (!formTarget) {
		return fallback
	}
	const candidate = new URL(formTarget, request.url)
	if (
		candidate.pathname !== "/provider/settings/verification" &&
		!candidate.pathname.startsWith("/provider/settings/verification/")
	) {
		return fallback
	}
	candidate.searchParams.set(result === "saved" ? "result" : "error", `line_collection_${result}`)
	return candidate
}

export const POST: APIRoute = async ({ request }) => {
	const session = await requireProviderSessionSurface(request).catch((error: unknown) => {
		if (error instanceof Response) return error
		throw error
	})
	if (session instanceof Response) return session
	const form = await request.formData()
	const line = String(form.get("line") ?? "").trim()
	const collectionModel = String(form.get("collectionModel") ?? "").trim()
	const returnTo = String(form.get("returnTo") ?? "").trim()
	if (!session.provider.permissions?.canEditProfile) {
		return Response.redirect(target(request, returnTo, "forbidden"), 303)
	}
	if (
		!commercialLines.includes(line as (typeof commercialLines)[number]) ||
		!commercialLineCollectionModels.includes(
			collectionModel as (typeof commercialLineCollectionModels)[number]
		)
	) {
		return Response.redirect(target(request, returnTo, "invalid"), 303)
	}
	const providerId = session.provider.providerId
	const before = (await listProviderCommercialLines(providerId)).find(
		(entry) => entry.line === line
	)
	const updated = await declareProviderCommercialLineCollectionModel({
		providerId,
		line: line as (typeof commercialLines)[number],
		collectionModel: collectionModel as (typeof commercialLineCollectionModels)[number],
		declaredByUserId: session.user.id,
	})
	if (!updated) return Response.redirect(target(request, returnTo, "line_missing"), 303)
	await writeProviderAuditLog({
		providerId,
		actorUserId: session.user.id,
		action: "provider.commercial_line_collection_declared",
		entityType: "ProviderCommercialLine",
		entityId: updated.id,
		beforeJson: before ? { line: before.line, collectionModel: before.collectionModel } : null,
		afterJson: { line: updated.line, collectionModel: updated.collectionModel },
		riskLevel: "high",
	})
	await invalidateProvider(providerId)
	return Response.redirect(target(request, returnTo, "saved"), 303)
}
