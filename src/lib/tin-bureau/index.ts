/**
 * TIN / taxpayer bureau adapter (P2 / S7-3).
 * Beyond local format checks: simulated harness + optional live IRS/vendor matching.
 *
 * Env:
 * - TIN_BUREAU_PROVIDER=format_only|simulated|irs_tin_matching
 * - TIN_BUREAU_API_KEY=… (required for irs path)
 * - TIN_BUREAU_API_URL=… (required for live exchange)
 * - TIN_BUREAU_LIVE=1 (opt-in; never enable by key alone)
 */

export type TinBureauProviderId = "format_only" | "simulated" | "irs_tin_matching"

export type TinBureauMode = "format_only" | "simulated" | "not_configured" | "scaffold" | "live"

export type TinBureauMatchStatus =
	| "not_checked"
	| "format_ok"
	| "match"
	| "mismatch"
	| "unavailable"

export type TinBureauCheckInput = {
	providerId: string
	country: string | null
	taxpayerId: string
	legalName?: string | null
}

export type TinBureauCheckResult = {
	ok: boolean
	provider: TinBureauProviderId
	mode: TinBureauMode
	matchStatus: TinBureauMatchStatus
	externalRef: string | null
	/** Technical / log message */
	message: string
	/** Host-facing Spanish narrative (no vendor jargon). */
	hostNarrative: string
	/** Admin-facing narrative for compliance review. */
	adminNarrative: string
	error?: string
}

export type TinBureauStatus = {
	preferredProvider: TinBureauProviderId
	mode: TinBureauMode
	hostLabel: string
	adminHint: string
	liveEnabled: boolean
	apiUrlPresent: boolean
}

function envTrim(key: string): string {
	return String(process.env[key] ?? "").trim()
}

export function resolveTinBureauPreference(): TinBureauProviderId {
	const raw = envTrim("TIN_BUREAU_PROVIDER").toLowerCase()
	if (raw === "simulated" || raw === "sim") return "simulated"
	if (raw === "irs" || raw === "irs_tin_matching" || raw === "bureau") return "irs_tin_matching"
	return "format_only"
}

export function isIrsTinMatchingConfigured(): boolean {
	return Boolean(envTrim("TIN_BUREAU_API_KEY"))
}

export function isTinBureauLiveEnabled(): boolean {
	const raw = envTrim("TIN_BUREAU_LIVE").toLowerCase()
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export function getTinBureauApiUrl(): string {
	return envTrim("TIN_BUREAU_API_URL").replace(/\/$/, "")
}

export function getTinBureauStatus(): TinBureauStatus {
	const preferredProvider = resolveTinBureauPreference()
	const liveEnabled = isTinBureauLiveEnabled()
	const apiUrlPresent = Boolean(getTinBureauApiUrl())

	if (preferredProvider === "format_only") {
		return {
			preferredProvider,
			mode: "format_only",
			liveEnabled,
			apiUrlPresent,
			hostLabel: "Validación de formato (sin bureau)",
			adminHint:
				"Solo checksum/formato local. Bureau: TIN_BUREAU_PROVIDER=simulated|irs_tin_matching (+ LIVE + API_URL).",
		}
	}
	if (preferredProvider === "simulated") {
		return {
			preferredProvider,
			mode: "simulated",
			liveEnabled,
			apiUrlPresent,
			hostLabel: "Verificación de registro (simulado)",
			adminHint: "TIN bureau simulado — no llama a IRS/Equifax. Harness: IDs *00 → mismatch.",
		}
	}
	if (!isIrsTinMatchingConfigured()) {
		return {
			preferredProvider,
			mode: "not_configured",
			liveEnabled,
			apiUrlPresent,
			hostLabel: "Validación de formato (bureau no configurado)",
			adminHint: "TIN_BUREAU_PROVIDER=irs_tin_matching pero falta TIN_BUREAU_API_KEY.",
		}
	}
	if (liveEnabled && apiUrlPresent) {
		return {
			preferredProvider,
			mode: "live",
			liveEnabled: true,
			apiUrlPresent: true,
			hostLabel: "Verificación de registro (bureau live)",
			adminHint: "IRS/vendor TIN Matching live (TIN_BUREAU_LIVE=1 + API_URL + API_KEY).",
		}
	}
	return {
		preferredProvider,
		mode: "scaffold",
		liveEnabled,
		apiUrlPresent,
		hostLabel: "Verificación de registro (bureau en preparación)",
		adminHint: liveEnabled
			? "Key presente; falta TIN_BUREAU_API_URL para match live."
			: "Key presente; opt-in TIN_BUREAU_LIVE=1 + API_URL para match live. Mientras: formato + revisión admin.",
	}
}

function narrate(params: {
	matchStatus: TinBureauMatchStatus
	mode: TinBureauMode
	message: string
	country?: string | null
}): Pick<TinBureauCheckResult, "hostNarrative" | "adminNarrative"> {
	const country = String(params.country ?? "")
		.trim()
		.toUpperCase()
	const countryBit = country ? ` (${country})` : ""

	switch (params.matchStatus) {
		case "match":
			return {
				hostNarrative:
					"El número de registro coincide con la razón social según la verificación externa. Queda pendiente la revisión del equipo Fastt.",
				adminNarrative: `Bureau ${params.mode}: match TIN/nombre${countryBit}. ${params.message}`,
			}
		case "mismatch":
			return {
				hostNarrative:
					"La verificación externa no encontró coincidencia entre el número de registro y la razón social. Corrige los datos o contacta a soporte.",
				adminNarrative: `Bureau ${params.mode}: mismatch TIN/nombre${countryBit}. ${params.message}`,
			}
		case "unavailable":
			return {
				hostNarrative:
					"Guardamos tu registro. Falta la razón social del proveedor para completar la verificación automática; el equipo Fastt puede revisarlo igual.",
				adminNarrative: `Bureau ${params.mode}: unavailable (falta legalName)${countryBit}. ${params.message}`,
			}
		case "format_ok":
			return {
				hostNarrative:
					params.mode === "format_only" || params.mode === "not_configured"
						? "El formato del registro es válido. La coincidencia con razón social (bureau) no está activa en este entorno; el equipo Fastt lo revisará."
						: "El formato del registro es válido. La verificación bureau aún no pudo confirmar el match; sigue en revisión.",
				adminNarrative: `Formato OK; sin match bureau (${params.mode})${countryBit}. ${params.message}`,
			}
		case "not_checked":
		default:
			return {
				hostNarrative: "Aún no hay verificación de registro fiscal.",
				adminNarrative: `TIN no chequeado (${params.mode}). ${params.message}`,
			}
	}
}

function withNarratives(
	result: Omit<TinBureauCheckResult, "hostNarrative" | "adminNarrative">,
	country?: string | null
): TinBureauCheckResult {
	const narratives = narrate({
		matchStatus: result.matchStatus,
		mode: result.mode,
		message: result.message,
		country,
	})
	return { ...result, ...narratives }
}

function simulatedMatch(
	taxpayerId: string,
	legalName?: string | null,
	country?: string | null
): TinBureauCheckResult {
	const digits = taxpayerId.replace(/\D+/g, "")
	const name = String(legalName ?? "")
		.trim()
		.toLowerCase()
	// Deterministic harness: IDs ending in 00 → mismatch; else match when name present.
	if (digits.endsWith("00")) {
		return withNarratives(
			{
				ok: true,
				provider: "simulated",
				mode: "simulated",
				matchStatus: "mismatch",
				externalRef: `sim_tin_${digits.slice(-4) || "xxxx"}`,
				message: "Bureau simulado: el TIN no coincide con el nombre (harness *00).",
			},
			country
		)
	}
	if (!name) {
		return withNarratives(
			{
				ok: true,
				provider: "simulated",
				mode: "simulated",
				matchStatus: "unavailable",
				externalRef: `sim_tin_${digits.slice(-4) || "xxxx"}`,
				message: "Bureau simulado: falta razón social para match nombre/TIN.",
			},
			country
		)
	}
	return withNarratives(
		{
			ok: true,
			provider: "simulated",
			mode: "simulated",
			matchStatus: "match",
			externalRef: `sim_tin_${digits.slice(-4) || "xxxx"}`,
			message: "Bureau simulado: TIN y nombre coinciden (harness).",
		},
		country
	)
}

type LiveMatchPayload = {
	match?: unknown
	matchStatus?: unknown
	status?: unknown
	reference?: unknown
	externalRef?: unknown
	message?: unknown
	error?: unknown
	error_description?: unknown
}

function parseLiveMatchStatus(json: LiveMatchPayload): TinBureauMatchStatus {
	const raw = String(json.matchStatus ?? json.status ?? json.match ?? "")
		.trim()
		.toLowerCase()
	if (raw === "match" || raw === "matched" || raw === "true" || raw === "1") return "match"
	if (raw === "mismatch" || raw === "no_match" || raw === "false" || raw === "0") return "mismatch"
	if (raw === "unavailable" || raw === "pending" || raw === "unknown") return "unavailable"
	if (typeof json.match === "boolean") return json.match ? "match" : "mismatch"
	return "unavailable"
}

/**
 * Live vendor TIN matching (generic JSON contract).
 * POST { tin, legalName, country, providerId } with Bearer API key.
 */
export async function callTinBureauLiveMatch(
	input: TinBureauCheckInput
): Promise<TinBureauCheckResult> {
	const apiUrl = getTinBureauApiUrl()
	const apiKey = envTrim("TIN_BUREAU_API_KEY")
	if (!apiUrl || !apiKey) {
		return withNarratives(
			{
				ok: false,
				provider: "irs_tin_matching",
				mode: "not_configured",
				matchStatus: "format_ok",
				externalRef: null,
				error: "not_configured",
				message: "Falta TIN_BUREAU_API_URL o TIN_BUREAU_API_KEY.",
			},
			input.country
		)
	}

	try {
		const response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				tin: input.taxpayerId,
				legalName: input.legalName ?? null,
				country: input.country ?? null,
				providerId: input.providerId,
			}),
		})
		const json = (await response.json().catch(() => ({}))) as LiveMatchPayload
		if (!response.ok) {
			const errMsg =
				typeof json.error_description === "string"
					? json.error_description
					: typeof json.error === "string"
						? json.error
						: typeof json.message === "string"
							? json.message
							: `tin_bureau_http_${response.status}`
			return withNarratives(
				{
					ok: false,
					provider: "irs_tin_matching",
					mode: "live",
					matchStatus: "unavailable",
					externalRef: null,
					error: "tin_bureau_http_error",
					message: errMsg,
				},
				input.country
			)
		}

		const matchStatus = parseLiveMatchStatus(json)
		const externalRef =
			typeof json.reference === "string"
				? json.reference
				: typeof json.externalRef === "string"
					? json.externalRef
					: `tin_live_${String(input.taxpayerId).replace(/\D+/g, "").slice(-4) || "xxxx"}`
		const vendorMessage =
			typeof json.message === "string" ? json.message : `Bureau live: ${matchStatus}.`

		return withNarratives(
			{
				ok: true,
				provider: "irs_tin_matching",
				mode: "live",
				matchStatus,
				externalRef,
				message: vendorMessage,
			},
			input.country
		)
	} catch (error) {
		return withNarratives(
			{
				ok: false,
				provider: "irs_tin_matching",
				mode: "live",
				matchStatus: "unavailable",
				externalRef: null,
				error: "tin_bureau_request_failed",
				message: error instanceof Error ? error.message : String(error),
			},
			input.country
		)
	}
}

/**
 * After format validation succeeds, optionally run bureau match.
 * Never throws — callers store result in tax metadata for host/admin narrative.
 */
export async function checkTinBureauMatch(
	input: TinBureauCheckInput
): Promise<TinBureauCheckResult> {
	const status = getTinBureauStatus()
	const taxpayerId = String(input.taxpayerId ?? "").trim()
	if (!taxpayerId) {
		return withNarratives(
			{
				ok: false,
				provider: status.preferredProvider,
				mode: status.mode,
				matchStatus: "not_checked",
				externalRef: null,
				error: "missing_taxpayer_id",
				message: "Falta número de contribuyente.",
			},
			input.country
		)
	}

	if (status.preferredProvider === "simulated") {
		return simulatedMatch(taxpayerId, input.legalName, input.country)
	}

	if (status.preferredProvider === "irs_tin_matching") {
		if (!isIrsTinMatchingConfigured()) {
			return withNarratives(
				{
					ok: true,
					provider: "irs_tin_matching",
					mode: "not_configured",
					matchStatus: "format_ok",
					externalRef: null,
					error: "not_configured",
					message: status.adminHint,
				},
				input.country
			)
		}
		if (status.mode === "live") {
			return callTinBureauLiveMatch(input)
		}
		return withNarratives(
			{
				ok: true,
				provider: "irs_tin_matching",
				mode: "scaffold",
				matchStatus: "format_ok",
				externalRef: null,
				error: "irs_tin_matching_scaffold",
				message:
					"IRS TIN Matching preparado (env) sin LIVE+URL. Formato OK; match externo pendiente de revisión admin.",
			},
			input.country
		)
	}

	return withNarratives(
		{
			ok: true,
			provider: "format_only",
			mode: "format_only",
			matchStatus: "format_ok",
			externalRef: null,
			message: "Formato validado localmente. Match bureau externo no activo.",
		},
		input.country
	)
}

/** Host badge / notice helpers for stored metadata. */
export function tinBureauMatchTone(
	matchStatus: TinBureauMatchStatus | string | null | undefined
): "success" | "warning" | "error" | "info" | "neutral" {
	switch (String(matchStatus ?? "")) {
		case "match":
			return "success"
		case "mismatch":
			return "error"
		case "unavailable":
			return "warning"
		case "format_ok":
			return "info"
		default:
			return "neutral"
	}
}

export function tinBureauMatchLabel(
	matchStatus: TinBureauMatchStatus | string | null | undefined
): string {
	switch (String(matchStatus ?? "")) {
		case "match":
			return "Coincide con razón social"
		case "mismatch":
			return "No coincide"
		case "unavailable":
			return "Verificación incompleta"
		case "format_ok":
			return "Formato válido"
		case "not_checked":
			return "Sin verificar"
		default:
			return "Sin dato bureau"
	}
}
