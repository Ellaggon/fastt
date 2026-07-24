import type { APIRoute } from "astro"

import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import {
	emitProviderSettingsFunnelEvent,
	isSettingsFunnelEventName,
	SETTINGS_FUNNEL_EVENTS,
} from "@/lib/provider-settings-funnel"

/**
 * Thin beacon for settings funnel (blocker → CTA → complete).
 * Auth required. Sink: SETTINGS_FUNNEL_SINK=log|db|both|noop (db/both → ProviderAuditLog queryable).
 */
export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	if (!user?.id) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const surface = await getProviderSessionSurfaceFromRequest(request, user)
	if (!surface?.providerId) {
		return new Response(JSON.stringify({ error: "forbidden" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		})
	}

	let body: Record<string, unknown> = {}
	try {
		body = (await request.json()) as Record<string, unknown>
	} catch {
		return new Response(null, { status: 204 })
	}

	const event = String(body.event ?? "").trim()
	if (!isSettingsFunnelEventName(event)) {
		return new Response(JSON.stringify({ error: "invalid_event" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	// Client must not claim domain_complete — only server governance persist does.
	if (event === SETTINGS_FUNNEL_EVENTS.domainComplete) {
		return new Response(JSON.stringify({ error: "server_only_event" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	emitProviderSettingsFunnelEvent({
		event,
		providerId: surface.providerId,
		domain: typeof body.domain === "string" ? body.domain : null,
		blockerId: typeof body.blockerId === "string" ? body.blockerId : null,
		ctaKind: typeof body.ctaKind === "string" ? body.ctaKind : null,
		ctaTarget: typeof body.ctaTarget === "string" ? body.ctaTarget : null,
		surface: typeof body.surface === "string" ? body.surface : null,
		progressPercent:
			typeof body.progressPercent === "number" && Number.isFinite(body.progressPercent)
				? body.progressPercent
				: null,
		actorUserId: user.id,
	})

	return new Response(null, {
		status: 204,
		headers: { "Cache-Control": "no-store" },
	})
}
