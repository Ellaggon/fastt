import type { APIRoute } from "astro"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import {
	commercialLineForOnboardingVertical,
	enrollProviderCommercialLine,
	listProviderCommercialLines,
	type CommercialLine,
} from "@/lib/verification/commercial-lines"

async function readLine(
	request: Request
): Promise<{ providerId: string; line: CommercialLine | null }> {
	const contentType = (request.headers.get("content-type") || "").toLowerCase()
	const body = contentType.includes("application/json")
		? ((await request.json()) as Record<string, unknown>)
		: Object.fromEntries(await request.formData())
	return {
		providerId: String(body.providerId ?? "").trim(),
		line: commercialLineForOnboardingVertical(body.line),
	}
}

/** Enrollment only. Removing a product or calling DELETE keeps the line. */
export const DELETE: APIRoute = async () =>
	new Response(
		JSON.stringify({
			error: "commercial_line_retained",
			message: "Quitar productos no borra la línea ni su historial de cumplimiento.",
		}),
		{ status: 405, headers: { "Content-Type": "application/json" } }
	)

export const POST: APIRoute = async ({ request }) => {
	try {
		const payload = await readLine(request)
		if (!payload.providerId || !payload.line) {
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 422,
				headers: { "Content-Type": "application/json" },
			})
		}
		const principal = await requireInternalPermission(request, "provider.verification.review", {
			type: "provider",
			id: payload.providerId,
		})
		const before = await listProviderCommercialLines(payload.providerId)
		const enrolled = await enrollProviderCommercialLine({
			providerId: payload.providerId,
			line: payload.line,
			source: "admin",
			enrolledByUserId: principal.user.id,
			required: true,
		})
		const after = await listProviderCommercialLines(payload.providerId)
		if (enrolled && !before.some((row) => row.line === payload.line)) {
			await writeProviderAuditLog({
				providerId: payload.providerId,
				actorUserId: principal.user.id,
				action: "provider.commercial_line.enroll",
				entityType: "ProviderCommercialLine",
				entityId: enrolled.id,
				beforeJson: { lines: before.map((row) => row.line) },
				afterJson: { lines: after.map((row) => row.line), source: "admin" },
				riskLevel: "medium",
			})
		}
		return new Response(JSON.stringify({ lines: after }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		if (error instanceof Response) return error
		if (error instanceof Error && error.message === "COMMERCIAL_LINE_STORAGE_MIGRATION_REQUIRED") {
			return new Response(JSON.stringify({ error: "commercial_line_storage_missing" }), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			})
		}
		const message = error instanceof Error ? error.message : "Unknown error"
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
