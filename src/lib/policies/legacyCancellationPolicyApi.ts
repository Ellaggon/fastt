const LEGACY_CANCELLATION_POLICY_SUNSET_DATE = "2026-06-30"
const LEGACY_CANCELLATION_POLICY_SUNSET_HTTP = "Tue, 30 Jun 2026 23:59:59 GMT"
const LEGACY_CANCELLATION_POLICY_WARNING =
	'299 Fastt "Retired endpoint: products cancellation-policies is no longer public. Use the canonical CAPA 6 policies APIs."'

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
				"This products cancellation-policies endpoint has been retired. Use the canonical CAPA 6 policies API.",
			successor,
			sunset: LEGACY_CANCELLATION_POLICY_SUNSET_DATE,
		},
	}
}

export function legacyCancellationPolicyGone(successor: string): Response {
	return new Response(
		JSON.stringify(
			withLegacyCancellationPolicyNotice(
				{
					error: "Gone",
					message:
						"This products cancellation-policies endpoint has been retired. Use CAPA 6 policy APIs for library, versioning, and assignment operations.",
				},
				successor
			)
		),
		{
			status: 410,
			headers: legacyCancellationPolicyHeaders(successor),
		}
	)
}
