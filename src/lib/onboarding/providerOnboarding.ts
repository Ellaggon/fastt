import { routes } from "@/lib/routes"

export const PROVIDER_ONBOARDING_VERTICALS = ["hotel", "tour"] as const
export type ProviderOnboardingVertical = (typeof PROVIDER_ONBOARDING_VERTICALS)[number]
export const PROVIDER_ONBOARDING_SELECTION_COOKIE = "fastt_provider_onboarding_vertical"

function isProviderOnboardingVertical(value: unknown): value is ProviderOnboardingVertical {
	return PROVIDER_ONBOARDING_VERTICALS.includes(
		String(value ?? "")
			.trim()
			.toLowerCase() as ProviderOnboardingVertical
	)
}

export function resolveProviderOnboardingVertical(
	value: unknown
): ProviderOnboardingVertical | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
	return isProviderOnboardingVertical(normalized) ? normalized : null
}

export function providerOnboardingStartHref(): string {
	return routes.providerOnboardingStart()
}

export function providerOnboardingBusinessHref(vertical: ProviderOnboardingVertical): string {
	return `/provider/onboarding/business?vertical=${encodeURIComponent(vertical)}`
}

export function providerOnboardingProductCreateHref(vertical: ProviderOnboardingVertical): string {
	return vertical === "tour"
		? "/product/create?type=Tour&playbook=launch-tour&step=create&flow=create"
		: "/product/create?playbook=launch&step=create&flow=create"
}

/**
 * The only post-save destinations accepted before a provider exists. This is
 * intentionally narrower than a generic returnTo because the form creates a
 * business association and must not become an open redirect.
 */
export function resolveProviderOnboardingNext(value: unknown, fallback: string): string {
	const raw = String(value ?? "").trim()
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return fallback

	let url: URL
	try {
		url = new URL(raw, "http://fastt.local")
	} catch {
		return fallback
	}

	if (url.pathname === "/provider/onboarding/business") {
		const vertical = resolveProviderOnboardingVertical(url.searchParams.get("vertical"))
		return vertical ? providerOnboardingBusinessHref(vertical) : fallback
	}
	if (url.pathname === "/product/create") {
		const vertical =
			resolveProviderOnboardingVertical(url.searchParams.get("vertical")) ??
			resolveProviderOnboardingVertical(url.searchParams.get("type"))
		if (vertical) return providerOnboardingProductCreateHref(vertical)

		const isAccommodationLaunch =
			url.searchParams.get("playbook") === "launch" &&
			url.searchParams.get("step") === "create" &&
			url.searchParams.get("flow") === "create"
		return isAccommodationLaunch ? providerOnboardingProductCreateHref("hotel") : fallback
	}
	return fallback
}
