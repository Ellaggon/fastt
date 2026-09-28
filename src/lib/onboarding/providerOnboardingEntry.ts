import { buildPlaybookHref } from "@/lib/playbook/launch-accommodation"
import { buildTourPlaybookHref } from "@/lib/playbook/launch-tour"
import { routes } from "@/lib/routes"
import { isHolderStorageAvailable, readProviderHolderProfile } from "@/lib/provider-holder-profile"
import { listProviderCommercialLines } from "@/lib/verification/commercial-lines"
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
	| { kind: "redirect"; href: string; reason: string; vertical?: ProviderOnboardingVertical }

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
 * One decision point for a provider returning to onboarding. Once the account
 * exists, enrolled commercial lines decide the journey. The selection cookie
 * only helps a visitor who does not have an account yet.
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
	/** Persisted account lines. The onboarding cookie is not read here. */
	enrolledLines?: readonly ("lodging" | "tour")[]
	/** Explicit request to add another line. It does not remove the ones already stored. */
	choosingAdditionalLine?: boolean
	holderDeclarationPending?: boolean
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
		return {
			kind: "redirect",
			href: activeSession.href,
			reason: "active_preparation_session",
			vertical: activeSession.vertical,
		}
	}

	if (input.firstProduct) {
		if (input.firstProduct.publicationState === "published") {
			return {
				kind: "redirect",
				href: routes.dashboard(),
				reason: "first_offer_published",
				vertical: productVertical(input.firstProduct.productType) ?? undefined,
			}
		}
		const href = fallbackPreparationHref(input.firstProduct)
		if (href) {
			return {
				kind: "redirect",
				href,
				reason: "first_offer_needs_preparation",
				vertical: productVertical(input.firstProduct.productType) ?? undefined,
			}
		}
		return { kind: "redirect", href: routes.dashboard(), reason: "unsupported_first_offer" }
	}

	if (input.choosingAdditionalLine) return { kind: "render-service-choice" }

	const enrolled = input.enrolledLines ?? []
	const onlyLine = enrolled.length === 1 ? enrolled[0] : null
	const resumeVertical = onlyLine === "tour" ? "tour" : onlyLine === "lodging" ? "hotel" : null
	if (!resumeVertical) {
		if (
			enrolled.length > 1 &&
			(input.holderDeclarationPending || !isOperationalProfileComplete(input.profile))
		) {
			return {
				kind: "redirect",
				href: providerOnboardingBusinessHref("hotel"),
				reason: input.holderDeclarationPending
					? "holder_declaration_pending"
					: "operational_profile_incomplete",
				vertical: "hotel",
			}
		}
		return { kind: "render-service-choice" }
	}
	if (input.holderDeclarationPending) {
		return {
			kind: "redirect",
			href: providerOnboardingBusinessHref(resumeVertical),
			reason: "holder_declaration_pending",
			vertical: resumeVertical,
		}
	}
	if (!isOperationalProfileComplete(input.profile)) {
		return {
			kind: "redirect",
			href: providerOnboardingBusinessHref(resumeVertical),
			reason: "operational_profile_incomplete",
			vertical: resumeVertical,
		}
	}
	return {
		kind: "redirect",
		href: providerOnboardingProductCreateHref(resumeVertical),
		reason: "business_ready_for_first_offer",
		vertical: resumeVertical,
	}
}

export async function resolveProviderOnboardingEntryFromStorage(input: {
	providerId: string | null
	userId: string
	explicitProviderIntent: boolean
	selectedVertical: ProviderOnboardingVertical | null
	choosingAdditionalLine?: boolean
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
	const providerId = input.providerId

	const [profile, product, activeSessions, holderDeclarationPending, enrolledLines] =
		await Promise.all([
			db
				.select({
					timezone: ProviderProfile.timezone,
					defaultCurrency: ProviderProfile.defaultCurrency,
					supportEmail: ProviderProfile.supportEmail,
				})
				.from(ProviderProfile)
				.where(eq(ProviderProfile.providerId, providerId))
				.then((rows) => rows[0] ?? null),
			db
				.select({
					id: Product.id,
					productType: Product.productType,
					publicationState: Product.publicationState,
				})
				.from(Product)
				.where(eq(Product.providerId, providerId))
				.orderBy(asc(Product.creationDate))
				.limit(1)
				.then((rows) => rows[0] ?? null),
			listActivePreparationSessions(providerId, input.userId).catch((error) => {
				// A missing Phase 2 table must not strand a new provider. The migration is
				// still required to offer durable resumption, but product state remains safe.
				console.error("Provider preparation session lookup failed.", error)
				return [] as PreparationResume[]
			}),
			isHolderStorageAvailable().then(async (ready) =>
				ready ? !(await readProviderHolderProfile(providerId)) : false
			),
			listProviderCommercialLines(providerId).then((rows) => rows.map((row) => row.line)),
		])

	return resolveProviderOnboardingEntry({
		hasProvider: true,
		explicitProviderIntent: input.explicitProviderIntent,
		selectedVertical: null,
		profile,
		activeSessions,
		firstProduct: product,
		enrolledLines,
		choosingAdditionalLine: input.choosingAdditionalLine,
		holderDeclarationPending,
	})
}
