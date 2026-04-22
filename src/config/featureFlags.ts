function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (value == null) return defaultValue
	const normalized = value.trim().toLowerCase()
	if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true
	if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false
	return defaultValue
}

export const featureFlags = {
	NEW_DASHBOARD_ARCH: parseBoolean(process.env.NEW_DASHBOARD_ARCH, false),
} as const

export type FeatureFlags = typeof featureFlags
