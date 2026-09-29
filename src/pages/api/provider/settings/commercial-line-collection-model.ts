import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { invalidateProvider } from "@/lib/cache/invalidation"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import {
	commercialLineCollectionModels,
	commercialLines,
	declareProviderCommercialLineCollectionModel,
	listProviderCommercialLines,
	providerCollectionDeclarationError,
} from "@/lib/verification/commercial-lines"

function response(
	request: Request,
	returnTo: string,
	code: string,
	status: number,
	message: string
) {
	if ((request.headers.get("accept") ?? "").includes("application/json")) {
		return new Response(
			JSON.stringify(
				status >= 400 ? { error: code, message } : { ok: true, result: code, message }
			),
			{
				status,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
	return Response.redirect(target(request, returnTo, code), 303)
}

function target(request: Request, formTarget: string, result: string) {
	const fallback = new URL("/provider/settings/verification", request.url)
	fallback.searchParams.set(result === "saved" ? "result" : "error", `line_collection_${result}`)
	if (!formTarget) {
		return fallback
	}
	const candidate = new URL(formTarget, request.url)
	if (
		candidate.origin !== fallback.origin ||
		(candidate.pathname !== "/provider/settings/verification" &&
			!candidate.pathname.startsWith("/provider/settings/verification/"))
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
		return response(
			request,
			returnTo,
			"forbidden",
			403,
			"Tu rol no puede cambiar esta declaración."
		)
	}
	if (
		!commercialLines.includes(line as (typeof commercialLines)[number]) ||
		!commercialLineCollectionModels.includes(
			collectionModel as (typeof commercialLineCollectionModels)[number]
		)
	) {
		return response(request, returnTo, "invalid", 422, "La línea o modalidad no es válida.")
	}
	const declarationError = providerCollectionDeclarationError(
		line as (typeof commercialLines)[number],
		collectionModel as (typeof commercialLineCollectionModels)[number]
	)
	if (declarationError) {
		const code =
			declarationError === "PLATFORM_COLLECTION_UNAVAILABLE"
				? "platform_unavailable"
				: "tour_agreement_required"
		return response(
			request,
			returnTo,
			code,
			422,
			declarationError === "PLATFORM_COLLECTION_UNAVAILABLE"
				? "Fastt todavía no procesa cobros del viajero en esta línea."
				: "El cobro directo de tours requiere un acuerdo comercial revisado por Fastt."
		)
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
	if (!updated) {
		return response(request, returnTo, "line_missing", 404, "La línea comercial no existe.")
	}
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
	return response(request, returnTo, "saved", 200, "La declaración se guardó.")
}
