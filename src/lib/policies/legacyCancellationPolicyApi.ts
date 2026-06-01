const LEGACY_CANCELLATION_POLICY_SUNSET_DATE = "2026-06-30"
const LEGACY_CANCELLATION_POLICY_SUNSET_HTTP = "Tue, 30 Jun 2026 23:59:59 GMT"
const LEGACY_CANCELLATION_POLICY_WARNING =
	'299 Fastt "Deprecated endpoint: products cancellation-policies is a CAPA 6 compatibility bridge. Use the canonical policies APIs."'

type LegacyCancellationPolicyBody = Record<string, unknown>

export function legacyCancellationPolicyHeaders(successor: string): Headers {
	return new Headers({
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
		"Deprecation": "true",
		"Sunset": LEGACY_CANCELLATION_POLICY_SUNSET_HTTP,
		"Warning": LEGACY_CANCELLATION_POLICY_WARNING,
		"Link": `<${successor}>; rel="successor-version"`,
		"X-Fastt-Compatibility": "cancellation-policies-capa6-bridge",
	})
}

export function withLegacyCancellationPolicyNotice<T extends LegacyCancellationPolicyBody>(
	body: T,
	successor: string
): T & {
	deprecated: true
	compatibilityMode: "capa6_bridge"
	migration: {
		message: string
		successor: string
		sunset: string
	}
} {
	return {
		...body,
		deprecated: true,
		compatibilityMode: "capa6_bridge",
		migration: {
			message:
				"This products cancellation-policies endpoint is legacy. It is authenticated, ownership-checked, backed by CAPA 6, and should be migrated to the canonical policies API.",
			successor,
			sunset: LEGACY_CANCELLATION_POLICY_SUNSET_DATE,
		},
	}
}

export function legacyCancellationPolicyJson<T extends LegacyCancellationPolicyBody>(
	body: T,
	successor: string,
	init: ResponseInit = {}
): Response {
	return new Response(JSON.stringify(withLegacyCancellationPolicyNotice(body, successor)), {
		...init,
		headers: legacyCancellationPolicyHeaders(successor),
	})
}

export function legacyCancellationPolicyError(
	error: string,
	status: number,
	successor: string
): Response {
	return legacyCancellationPolicyJson({ error }, successor, { status })
}
