const SYNTHETIC_CREDENTIAL_PREFIX = "test://"
const HARNESS_ENV = "PROVIDER_INTEGRATION_TEST_HARNESS"

type HarnessOptions = {
	mode?: string | null
	env?: NodeJS.ProcessEnv
}

export function isSyntheticProviderIntegrationCredential(value: unknown): boolean {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.startsWith(SYNTHETIC_CREDENTIAL_PREFIX)
}

export function canUseProviderIntegrationTestHarness(options: HarnessOptions = {}): boolean {
	if (String(options.mode ?? "sandbox") === "production") return false
	const env = options.env ?? process.env
	if (env.NODE_ENV === "production") return false
	if (env.NODE_ENV === "test" || Boolean(env.VITEST)) return true
	const explicit = String(env[HARNESS_ENV] ?? "")
		.trim()
		.toLowerCase()
	return env.NODE_ENV === "development" && ["1", "true", "yes", "on"].includes(explicit)
}

export function assertProviderIntegrationTestCredentialAllowed(
	value: unknown,
	options: HarnessOptions = {}
): void {
	if (!isSyntheticProviderIntegrationCredential(value)) return
	if (!canUseProviderIntegrationTestHarness(options)) {
		throw new Error("INTEGRATION_TEST_CREDENTIAL_FORBIDDEN")
	}
}
