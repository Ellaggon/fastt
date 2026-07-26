/**
 * Identity vendor adapter (V3 — optional market).
 * Selfie + liveness via Persona / Jumio-style vendors — never default-on.
 *
 * P3 rules:
 * - Host selfie/camera surface ONLY when mode === "live" (LIVE + URL + KEY).
 * - Never substitutes P0: manual document upload + canManageDocuments remain the path.
 *
 * Env:
 * - IDENTITY_VENDOR_PROVIDER=off|simulated|persona|jumio
 * - IDENTITY_VENDOR_API_KEY=… (required for persona|jumio)
 * - IDENTITY_VENDOR_API_URL=… (required for live exchange)
 * - IDENTITY_VENDOR_LIVE=1 (opt-in; never enable by key alone)
 * - IDENTITY_VENDOR_TEMPLATE_ID=… (optional inquiry/template id)
 *
 * Honesty rule: do not claim Airbnb-grade liveness unless mode === "live".
 */

export type IdentityVendorProviderId = "off" | "simulated" | "persona" | "jumio"

export type IdentityVendorMode = "off" | "simulated" | "not_configured" | "scaffold" | "live"

export type IdentityVendorSessionStatus =
	| "created"
	| "pending"
	| "completed"
	| "failed"
	| "unavailable"

export type IdentityVendorStatus = {
	preferredProvider: IdentityVendorProviderId
	mode: IdentityVendorMode
	hostLabel: string
	adminHint: string
	liveEnabled: boolean
	apiUrlPresent: boolean
	/**
	 * Host-visible selfie/camera card. P3: true only when mode === "live".
	 * Simulated/scaffold never appear on Verificación (do not substitute P0 manual UX).
	 */
	surfaceEnabled: boolean
	/** Explicit selfie capability for hosts (alias of live surface). */
	selfieLive: boolean
}

export type StartIdentityVendorSessionInput = {
	providerId: string
	actorUserId: string
	returnUrl: string
	legalName?: string | null
}

export type StartIdentityVendorSessionResult = {
	ok: boolean
	provider: IdentityVendorProviderId
	mode: IdentityVendorMode
	sessionStatus: IdentityVendorSessionStatus
	externalRef: string | null
	launchUrl: string | null
	/** Host-facing Spanish — no false Airbnb/liveness claims. */
	hostNarrative: string
	adminNarrative: string
	error?: string
}

function envTrim(key: string): string {
	return String(process.env[key] ?? "").trim()
}

export function resolveIdentityVendorPreference(): IdentityVendorProviderId {
	const raw = envTrim("IDENTITY_VENDOR_PROVIDER").toLowerCase()
	if (raw === "simulated" || raw === "sim") return "simulated"
	if (raw === "persona") return "persona"
	if (raw === "jumio" || raw === "netverify") return "jumio"
	return "off"
}

export function isIdentityVendorApiKeyPresent(): boolean {
	return Boolean(envTrim("IDENTITY_VENDOR_API_KEY"))
}

export function isIdentityVendorLiveEnabled(): boolean {
	const raw = envTrim("IDENTITY_VENDOR_LIVE").toLowerCase()
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export function getIdentityVendorApiUrl(): string {
	return envTrim("IDENTITY_VENDOR_API_URL").replace(/\/$/, "")
}

export function getIdentityVendorTemplateId(): string {
	return envTrim("IDENTITY_VENDOR_TEMPLATE_ID")
}

function statusBase(
	partial: Omit<IdentityVendorStatus, "selfieLive" | "surfaceEnabled"> & {
		surfaceEnabled?: boolean
	}
): IdentityVendorStatus {
	const selfieLive = partial.mode === "live"
	return {
		...partial,
		/** P3: host selfie surface only in live. */
		surfaceEnabled: selfieLive,
		selfieLive,
	}
}

/**
 * Honest vendor status for host/admin UX.
 * Live selfie/liveness only when preferred=persona|jumio, key+URL present, and LIVE=1.
 * Host card (`surfaceEnabled`) is live-only — never shows simulated as a selfie substitute.
 */
export function getIdentityVendorStatus(): IdentityVendorStatus {
	const preferredProvider = resolveIdentityVendorPreference()
	const liveEnabled = isIdentityVendorLiveEnabled()
	const apiUrlPresent = Boolean(getIdentityVendorApiUrl())
	const keyPresent = isIdentityVendorApiKeyPresent()

	if (preferredProvider === "off") {
		return statusBase({
			preferredProvider,
			mode: "off",
			liveEnabled,
			apiUrlPresent,
			hostLabel: "Verificación con cámara desactivada",
			adminHint:
				"Default off (V1–V2 UX). Host selfie solo con LIVE: IDENTITY_VENDOR_PROVIDER=persona|jumio + LIVE=1 + API_URL + API_KEY. Simulated no muestra card host (P3).",
		})
	}

	if (preferredProvider === "simulated") {
		return statusBase({
			preferredProvider,
			mode: "simulated",
			liveEnabled,
			apiUrlPresent,
			hostLabel: "Verificación con cámara (simulado)",
			adminHint:
				"Harness simulado — no hay liveness real ni selfie vendor en host. P3: surface host off; no sustituye P0 (subida manual + permisos).",
		})
	}

	if (!keyPresent) {
		return statusBase({
			preferredProvider,
			mode: "not_configured",
			liveEnabled,
			apiUrlPresent,
			hostLabel: "Verificación con cámara (no configurada)",
			adminHint: `IDENTITY_VENDOR_PROVIDER=${preferredProvider} pero falta IDENTITY_VENDOR_API_KEY — fallback a subida manual (P0). Host card off hasta LIVE.`,
		})
	}

	if (liveEnabled && apiUrlPresent) {
		return statusBase({
			preferredProvider,
			mode: "live",
			liveEnabled: true,
			apiUrlPresent: true,
			hostLabel: "Verificación con cámara (live)",
			adminHint: `${preferredProvider} live (IDENTITY_VENDOR_LIVE=1 + API_URL + API_KEY). Complementa; no sustituye P0 (canManageDocuments + subida manual).`,
		})
	}

	return statusBase({
		preferredProvider,
		mode: "scaffold",
		liveEnabled,
		apiUrlPresent,
		hostLabel: "Verificación con cámara (en preparación)",
		adminHint: liveEnabled
			? "Key presente; falta IDENTITY_VENDOR_API_URL para sesión live. Host card off (P3)."
			: "Key presente; opt-in IDENTITY_VENDOR_LIVE=1 + API_URL para liveness real. Mientras: subida manual (P0). Host card off.",
	})
}

function simulatedSession(
	input: StartIdentityVendorSessionInput
): StartIdentityVendorSessionResult {
	const ref = `sim_id_${String(input.providerId).slice(0, 8)}_${Date.now().toString(36)}`
	return {
		ok: true,
		provider: "simulated",
		mode: "simulated",
		sessionStatus: "created",
		externalRef: ref,
		launchUrl: null,
		hostNarrative:
			"Sesión de prueba interna. No hay selfie ni liveness real — usa la subida manual del documento de identidad (camino P0).",
		adminNarrative: `Identity vendor simulated session ${ref} for provider=${input.providerId}. No host selfie surface (P3).`,
	}
}

/**
 * Live vendor session (generic JSON contract).
 * POST { providerId, returnUrl, legalName?, templateId? } with Bearer API key.
 * Expects { inquiryId|id, launchUrl|url } on 2xx.
 */
async function startLiveVendorSession(
	input: StartIdentityVendorSessionInput,
	provider: "persona" | "jumio"
): Promise<StartIdentityVendorSessionResult> {
	const apiUrl = getIdentityVendorApiUrl()
	const apiKey = envTrim("IDENTITY_VENDOR_API_KEY")
	const templateId = getIdentityVendorTemplateId()

	if (!apiUrl || !apiKey) {
		return {
			ok: false,
			provider,
			mode: "scaffold",
			sessionStatus: "unavailable",
			externalRef: null,
			launchUrl: null,
			hostNarrative:
				"La verificación con cámara aún no está lista. Sube el documento de identidad manualmente.",
			adminNarrative: `Falta IDENTITY_VENDOR_API_URL o IDENTITY_VENDOR_API_KEY (${provider}).`,
			error: "identity_vendor_not_configured",
		}
	}

	if (!isIdentityVendorLiveEnabled()) {
		return {
			ok: false,
			provider,
			mode: "scaffold",
			sessionStatus: "unavailable",
			externalRef: null,
			launchUrl: null,
			hostNarrative:
				"La selfie con prueba de vida solo está disponible en entorno live. Usa la subida manual.",
			adminNarrative: "IDENTITY_VENDOR_LIVE is not enabled — refusing live selfie session (P3).",
			error: "identity_vendor_not_live",
		}
	}

	try {
		const response = await fetch(`${apiUrl}/sessions`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				providerId: input.providerId,
				returnUrl: input.returnUrl,
				legalName: input.legalName ?? null,
				templateId: templateId || null,
				capabilities: ["government_id", "selfie", "liveness"],
				vendor: provider,
			}),
		})

		const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
		if (!response.ok) {
			const errCode =
				typeof payload.error === "string"
					? payload.error
					: `identity_vendor_http_${response.status}`
			return {
				ok: false,
				provider,
				mode: "live",
				sessionStatus: "failed",
				externalRef: null,
				launchUrl: null,
				hostNarrative:
					"No pudimos abrir la verificación con cámara. Usa la subida manual del documento.",
				adminNarrative: `${provider} session failed: ${errCode}`,
				error: errCode,
			}
		}

		const externalRef =
			String(payload.inquiryId ?? payload.id ?? payload.sessionId ?? "").trim() || null
		const launchUrl =
			String(payload.launchUrl ?? payload.url ?? payload.hostedUrl ?? "").trim() || null

		return {
			ok: Boolean(launchUrl || externalRef),
			provider,
			mode: "live",
			sessionStatus: "created",
			externalRef,
			launchUrl,
			hostNarrative: launchUrl
				? "Abre la verificación con cámara (documento + prueba de vida). Si falla, vuelve a la subida manual — el vendor no reemplaza el permiso de Documentos."
				: "Sesión creada. Si no ves el enlace, recarga o usa la subida manual.",
			adminNarrative: `${provider} live session ref=${externalRef ?? "none"} launch=${Boolean(launchUrl)}`,
		}
	} catch (err: any) {
		return {
			ok: false,
			provider,
			mode: "live",
			sessionStatus: "failed",
			externalRef: null,
			launchUrl: null,
			hostNarrative:
				"No pudimos contactar el servicio de cámara. Sube el documento de identidad manualmente.",
			adminNarrative: `${provider} request failed: ${String(err?.message || err)}`,
			error: "identity_vendor_request_failed",
		}
	}
}

/**
 * Start an identity vendor session.
 * P3: host selfie launch only when status.mode === "live". Never invents liveness without LIVE+URL+KEY.
 * Simulated remains an internal harness (no launchUrl / no host surface).
 */
export async function startIdentityVendorSession(
	input: StartIdentityVendorSessionInput
): Promise<StartIdentityVendorSessionResult> {
	const status = getIdentityVendorStatus()

	if (status.mode === "off") {
		return {
			ok: false,
			provider: "off",
			mode: "off",
			sessionStatus: "unavailable",
			externalRef: null,
			launchUrl: null,
			hostNarrative: "La verificación con cámara no está activa. Usa la subida manual.",
			adminNarrative: "IDENTITY_VENDOR_PROVIDER=off",
			error: "identity_vendor_off",
		}
	}

	if (status.mode === "simulated") {
		return simulatedSession(input)
	}

	if (status.mode === "not_configured" || status.mode === "scaffold") {
		return {
			ok: false,
			provider: status.preferredProvider,
			mode: status.mode,
			sessionStatus: "unavailable",
			externalRef: null,
			launchUrl: null,
			hostNarrative:
				"La selfie con prueba de vida solo está disponible cuando el entorno está en live. Mientras tanto, sube el documento de identidad manualmente (camino principal).",
			adminNarrative: status.adminHint,
			error: "identity_vendor_not_live",
		}
	}

	if (status.mode !== "live") {
		return {
			ok: false,
			provider: status.preferredProvider,
			mode: status.mode,
			sessionStatus: "unavailable",
			externalRef: null,
			launchUrl: null,
			hostNarrative: "La verificación con cámara no está disponible. Usa la subida manual.",
			adminNarrative: `Refusing non-live mode=${status.mode} (P3)`,
			error: "identity_vendor_not_live",
		}
	}

	if (status.preferredProvider === "persona" || status.preferredProvider === "jumio") {
		return startLiveVendorSession(input, status.preferredProvider)
	}

	return {
		ok: false,
		provider: status.preferredProvider,
		mode: status.mode,
		sessionStatus: "unavailable",
		externalRef: null,
		launchUrl: null,
		hostNarrative: "Proveedor de cámara no soportado. Usa la subida manual.",
		adminNarrative: `Unsupported live provider ${status.preferredProvider}`,
		error: "identity_vendor_unsupported",
	}
}
