export const FEATURE_FLAG_DEFAULTS = {
	NEW_DASHBOARD_ARCH: false,
	SEARCH_V2_ENABLED: false,
	POLICY_DTO_V2_ENABLED: false,
	FINANCIAL_SHADOW_WRITE: false,
	SEARCH_SHADOW_COMPARE: false,
	SEARCH_POLICY_BLOCKER_ENABLED: false,
} as const

export type FeatureFlagName = keyof typeof FEATURE_FLAG_DEFAULTS

export type FeatureFlagContext = {
	request?: Request | null
	headers?: Headers | Record<string, string | undefined> | null
	query?: URLSearchParams | Record<string, string | undefined> | null
	env?: Record<string, string | undefined> | null
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (value == null) return defaultValue
	const normalized = value.trim().toLowerCase()
	if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true
	if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false
	return defaultValue
}

function normalizeFlagName(flagName: string): string {
	return String(flagName).trim().toUpperCase()
}

function normalizeFlagKeyForHeader(flagName: string): string {
	return normalizeFlagName(flagName).toLowerCase().replace(/_/g, "-")
}

function readHeader(
	headers: Headers | Record<string, string | undefined> | null | undefined,
	key: string
): string | undefined {
	if (!headers) return undefined
	if (headers instanceof Headers) {
		return headers.get(key) ?? undefined
	}
	const lowerKey = key.toLowerCase()
	for (const [k, v] of Object.entries(headers)) {
		if (k.toLowerCase() === lowerKey) return v
	}
	return undefined
}

function readQuery(
	query: URLSearchParams | Record<string, string | undefined> | null | undefined,
	key: string
): string | undefined {
	if (!query) return undefined
	if (query instanceof URLSearchParams) {
		const value = query.get(key)
		return value == null ? undefined : value
	}
	for (const [k, v] of Object.entries(query)) {
		if (k === key) return v
	}
	return undefined
}

function resolveHeaders(
	context: FeatureFlagContext
): Headers | Record<string, string | undefined> | null {
	if (context.headers) return context.headers
	if (context.request) return context.request.headers
	return null
}

function resolveQuery(
	context: FeatureFlagContext
): URLSearchParams | Record<string, string | undefined> | null {
	if (context.query) return context.query
	if (context.request) {
		try {
			const url = new URL(context.request.url)
			return url.searchParams
		} catch {
			return null
		}
	}
	return null
}

function getEnvValue(flagName: FeatureFlagName, context?: FeatureFlagContext): string | undefined {
	const source = context?.env ?? null
	const normalized = normalizeFlagName(flagName)
	if (source && typeof source === "object") {
		const exact = source[normalized]
		if (exact != null) return String(exact)
	}
	const processValue = process.env[normalized]
	if (processValue != null) return processValue
	return undefined
}

function getOverrideValue(
	flagName: FeatureFlagName,
	context?: FeatureFlagContext
): string | undefined {
	const normalizedName = normalizeFlagName(flagName)
	const lowerName = normalizedName.toLowerCase()
	const headerKey = `x-flag-${normalizeFlagKeyForHeader(flagName)}`
	const headers = resolveHeaders(context ?? {})
	const query = resolveQuery(context ?? {})

	const headerOverride =
		readHeader(headers, headerKey) ??
		readHeader(headers, `x-flag-${lowerName}`) ??
		readHeader(headers, "x-flag")
	if (headerOverride != null && String(headerOverride).trim().length > 0) {
		return String(headerOverride)
	}

	const queryOverride =
		readQuery(query, normalizedName) ??
		readQuery(query, lowerName) ??
		readQuery(query, `flag_${lowerName}`) ??
		readQuery(query, "flag")
	if (queryOverride != null && String(queryOverride).trim().length > 0) {
		return String(queryOverride)
	}

	return undefined
}

export function getFeatureFlag(flagName: FeatureFlagName, context?: FeatureFlagContext): boolean {
	const normalizedName = normalizeFlagName(flagName) as FeatureFlagName
	const defaultValue = FEATURE_FLAG_DEFAULTS[normalizedName]
	const overrideValue = getOverrideValue(normalizedName, context)
	if (overrideValue != null) {
		return parseBoolean(overrideValue, defaultValue)
	}
	const envValue = getEnvValue(normalizedName, context)
	return parseBoolean(envValue, defaultValue)
}

export function getFeatureFlags(context?: FeatureFlagContext): Record<FeatureFlagName, boolean> {
	return {
		NEW_DASHBOARD_ARCH: getFeatureFlag("NEW_DASHBOARD_ARCH", context),
		SEARCH_V2_ENABLED: getFeatureFlag("SEARCH_V2_ENABLED", context),
		POLICY_DTO_V2_ENABLED: getFeatureFlag("POLICY_DTO_V2_ENABLED", context),
		FINANCIAL_SHADOW_WRITE: getFeatureFlag("FINANCIAL_SHADOW_WRITE", context),
		SEARCH_SHADOW_COMPARE: getFeatureFlag("SEARCH_SHADOW_COMPARE", context),
		SEARCH_POLICY_BLOCKER_ENABLED: getFeatureFlag("SEARCH_POLICY_BLOCKER_ENABLED", context),
	}
}

export const featureFlags = getFeatureFlags()

export type FeatureFlags = typeof featureFlags

export type SearchHealthThresholds = {
	maxSellableMismatchRate: number
	maxReasonMismatchRate: number
	maxPriceMismatchRate: number
	maxCriticalMismatchRate: number
}

function parseNumber(value: string | undefined, defaultValue: number): number {
	if (value == null) return defaultValue
	if (String(value).trim().length === 0) return defaultValue
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return defaultValue
	return parsed
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

export function getSearchShadowSamplingRate(context?: FeatureFlagContext): number {
	const headers = resolveHeaders(context ?? {})
	const query = resolveQuery(context ?? {})
	const raw =
		readHeader(headers, "x-search-shadow-sampling-rate") ??
		readHeader(headers, "x-flag-search-shadow-sampling-rate") ??
		readQuery(query, "search_shadow_sampling_rate") ??
		readQuery(query, "searchShadowSamplingRate") ??
		String(
			context?.env?.SEARCH_SHADOW_SAMPLING_RATE ?? process.env.SEARCH_SHADOW_SAMPLING_RATE ?? ""
		)

	return clamp(parseNumber(raw, 1), 0, 1)
}

export function getSearchHealthThresholds(context?: FeatureFlagContext): SearchHealthThresholds {
	const headers = resolveHeaders(context ?? {})
	const query = resolveQuery(context ?? {})
	const readValue = (key: string, fallbackEnvKey: string, defaultValue: number): number => {
		const raw =
			readHeader(headers, `x-${key.toLowerCase().replace(/_/g, "-")}`) ??
			readHeader(headers, `x-flag-${key.toLowerCase().replace(/_/g, "-")}`) ??
			readQuery(query, key.toLowerCase()) ??
			readQuery(query, key) ??
			String(context?.env?.[fallbackEnvKey] ?? process.env[fallbackEnvKey] ?? "")
		return clamp(parseNumber(raw, defaultValue), 0, 1)
	}

	return {
		maxSellableMismatchRate: readValue(
			"SEARCH_MAX_SELLABLE_MISMATCH_RATE",
			"SEARCH_MAX_SELLABLE_MISMATCH_RATE",
			0.01
		),
		maxReasonMismatchRate: readValue(
			"SEARCH_MAX_REASON_MISMATCH_RATE",
			"SEARCH_MAX_REASON_MISMATCH_RATE",
			0.05
		),
		maxPriceMismatchRate: readValue(
			"SEARCH_MAX_PRICE_MISMATCH_RATE",
			"SEARCH_MAX_PRICE_MISMATCH_RATE",
			0.02
		),
		maxCriticalMismatchRate: readValue(
			"SEARCH_MAX_CRITICAL_MISMATCH_RATE",
			"SEARCH_MAX_CRITICAL_MISMATCH_RATE",
			0.005
		),
	}
}
