import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { getIdentityVendorStatus, startIdentityVendorSession } from "@/lib/identity-vendor"
import { routes } from "@/lib/routes"

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const GET: APIRoute = async ({ request }) => {
	try {
		await requireProviderSessionSurface(request)
		const status = getIdentityVendorStatus()
		return json({
			status,
			honesty:
				status.mode === "live"
					? "Sesión live habilitada (env). Complementa la subida manual; no sustituye P0 (permisos Documentos)."
					: "Sin selfie host: solo LIVE muestra cámara. Camino principal = subida manual (P0).",
		})
	} catch (err: any) {
		if (err instanceof Response) return err
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { user, provider } = await requireProviderSessionSurface(request)

		// P0 guard: vendor must never bypass document permissions.
		if (!provider.permissions?.canManageDocuments) {
			return json(
				{
					ok: false,
					error: "forbidden_documents",
					message:
						"Tu rol no puede gestionar documentos. El vendor de cámara no sustituye ese permiso — revisa Equipo.",
				},
				403
			)
		}

		const status = getIdentityVendorStatus()
		// P3: refuse host selfie sessions unless LIVE.
		if (status.mode !== "live" || !status.selfieLive) {
			return json(
				{
					ok: false,
					error: "identity_vendor_not_live",
					session: {
						ok: false,
						provider: status.preferredProvider,
						mode: status.mode,
						sessionStatus: "unavailable",
						externalRef: null,
						launchUrl: null,
						hostNarrative:
							"La selfie con prueba de vida solo está disponible en entorno live. Usa la subida manual del documento.",
						adminNarrative: status.adminHint,
						error: "identity_vendor_not_live",
					},
				},
				400
			)
		}

		const body = await request.json().catch(() => ({}))
		const returnUrl = String(
			(body as { returnUrl?: string }).returnUrl ||
				new URL(routes.providerSettingsVerification(), request.url).toString()
		).trim()

		const result = await startIdentityVendorSession({
			providerId: provider.providerId,
			actorUserId: user.id,
			returnUrl,
			legalName: null,
		})

		return json({ ok: result.ok, session: result }, result.ok ? 201 : 400)
	} catch (err: any) {
		if (err instanceof Response) return err
		return json({ error: String(err?.message || "Unknown error") }, 400)
	}
}
