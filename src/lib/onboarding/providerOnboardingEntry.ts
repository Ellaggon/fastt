import { buildPlaybookHref } from "@/lib/playbook/launch-accommodation"
import { buildTourPlaybookHref } from "@/lib/playbook/launch-tour"
import { routes } from "@/lib/routes"
import { asc, db, eq, Product, ProviderProfile } from "@/shared/infrastructure/db/compat"
import { listActivePreparationSessions, type PreparationResume } from "./preparationSession"
import {
	providerOnboardingBusinessHref,
	providerOnboardingProductCreateHref,
	type ProviderOnboardingVertical,
} from "./providerOnboarding"

type OnboardingProduct = {
	id: string
	productType: string
	publicationState: string
}

export type ProviderOnboardingEntry =
	| { kind: "render-welcome" }
	| { kind: "render-service-choice" }
	| { kind: "render-continue"; vertical: ProviderOnboardingVertical }
	| { kind: "redirect"; href: string; reason: string }

function isOperationalProfileComplete(
	profile: {
		timezone?: string | null
		defaultCurrency?: string | null
		supportEmail?: string | null
	} | null
) {
	return Boolean(
		profile?.timezone?.trim() && profile.defaultCurrency?.trim() && profile.supportEmail?.trim()
	)
}

function productVertical(productType: unknown): ProviderOnboardingVertical | null {
	const value = String(productType ?? "")
		.trim()
		.toLowerCase()
	if (value === "hotel") return "hotel"
	if (value === "tour") return "tour"
	return null
}

function fallbackPreparationHref(product: OnboardingProduct): string | null {
	const vertical = productVertical(product.productType)
	if (!vertical) return null
	const step = product.publicationState === "ready" ? "preview" : "content"
	return vertical === "tour"
		? buildTourPlaybookHref(`/product/${encodeURIComponent(product.id)}/${step}`, step)
		: buildPlaybookHref(`/product/${encodeURIComponent(product.id)}/${step}`, step)
}

/**
 * One decision point for a provider returning to onboarding. It deliberately
 * uses persisted facts only; cookies provide the chosen vertical but never
 * authorize a product or an operational route.
 */
export function resolveProviderOnboardingEntry(input: {
	hasProvider: boolean
	explicitProviderIntent: boolean
	selectedVertical: ProviderOnboardingVertical | null
	profile: {
		timezone?: string | null
		defaultCurrency?: string | null
		supportEmail?: string | null
	} | null
	activeSessions: readonly PreparationResume[]
	firstProduct: OnboardingProduct | null
}): ProviderOnboardingEntry {
	if (!input.hasProvider) {
		if (input.explicitProviderIntent && input.selectedVertical) {
			return {
				kind: "redirect",
				href: providerOnboardingBusinessHref(input.selectedVertical),
				reason: "selected_service_before_business",
			}
		}
		if (input.selectedVertical) return { kind: "render-continue", vertical: input.selectedVertical }
		return input.explicitProviderIntent
			? { kind: "render-service-choice" }
			: { kind: "render-welcome" }
	}

	const activeSession = input.activeSessions[0]
	if (activeSession) {
		return { kind: "redirect", href: activeSession.href, reason: "active_preparation_session" }
	}

	if (input.firstProduct) {
		if (input.firstProduct.publicationState === "published") {
			return { kind: "redirect", href: routes.dashboard(), reason: "first_offer_published" }
		}
		const href = fallbackPreparationHref(input.firstProduct)
		if (href) return { kind: "redirect", href, reason: "first_offer_needs_preparation" }
		return { kind: "redirect", href: routes.dashboard(), reason: "unsupported_first_offer" }
	}

	if (!input.selectedVertical) return { kind: "render-service-choice" }
	if (!isOperationalProfileComplete(input.profile)) {
		return {
			kind: "redirect",
			href: providerOnboardingBusinessHref(input.selectedVertical),
			reason: "operational_profile_incomplete",
		}
	}
	return {
		kind: "redirect",
		href: providerOnboardingProductCreateHref(input.selectedVertical),
		reason: "business_ready_for_first_offer",
	}
}

export async function resolveProviderOnboardingEntryFromStorage(input: {
	providerId: string | null
	userId: string
	explicitProviderIntent: boolean
	selectedVertical: ProviderOnboardingVertical | null
}): Promise<ProviderOnboardingEntry> {
	if (!input.providerId) {
		return resolveProviderOnboardingEntry({
			hasProvider: false,
			explicitProviderIntent: input.explicitProviderIntent,
			selectedVertical: input.selectedVertical,
			profile: null,
			activeSessions: [],
			firstProduct: null,
		})
	}

	const [profile, product, activeSessions] = await Promise.all([
		db
			.select({
				timezone: ProviderProfile.timezone,
				defaultCurrency: ProviderProfile.defaultCurrency,
				supportEmail: ProviderProfile.supportEmail,
			})
			.from(ProviderProfile)
			.where(eq(ProviderProfile.providerId, input.providerId))
			.then((rows) => rows[0] ?? null),
		db
			.select({
				id: Product.id,
				productType: Product.productType,
				publicationState: Product.publicationState,
			})
			.from(Product)
			.where(eq(Product.providerId, input.providerId))
			.orderBy(asc(Product.creationDate))
			.limit(1)
			.then((rows) => rows[0] ?? null),
		listActivePreparationSessions(input.providerId, input.userId).catch((error) => {
			// A missing Phase 2 table must not strand a new provider. The migration is
			// still required to offer durable resumption, but product state remains safe.
			console.error("Provider preparation session lookup failed.", error)
			return [] as PreparationResume[]
		}),
	])

	return resolveProviderOnboardingEntry({
		hasProvider: true,
		explicitProviderIntent: input.explicitProviderIntent,
		selectedVertical: input.selectedVertical,
		profile,
		activeSessions,
		firstProduct: product,
	})
}
