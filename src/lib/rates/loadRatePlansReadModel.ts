import { requireProvider } from "@/lib/auth/requireProvider"
import type { ServerTimingRecorder } from "@/lib/observability/serverTiming"
import {
	buildProviderRatePlansSurface,
	type RatePlanListItem,
} from "@/lib/rates/providerRatePlansSurface"
import { resolvePolicyDateRange } from "@/modules/policies/public"

export type { RatePlanListItem } from "@/lib/rates/providerRatePlansSurface"

type ProviderRatePlansReadInput = {
	providerId: string
	url?: URL
	checkIn?: string
	checkOut?: string
	timing?: ServerTimingRecorder
}

export async function loadProviderRatePlansReadModel(
	input: ProviderRatePlansReadInput
): Promise<RatePlanListItem[]> {
	const providerId = String(input.providerId ?? "").trim()
	if (!providerId) throw new Error("Provider id is required")
	const range =
		input.checkIn && input.checkOut
			? { checkIn: input.checkIn, checkOut: input.checkOut }
			: resolvePolicyDateRange(input.url ?? new URL("http://fastt.local/rates/plans"))
	const surface = await buildProviderRatePlansSurface({
		providerId,
		checkIn: range.checkIn,
		checkOut: range.checkOut,
		timing: input.timing,
	})
	return surface.ratePlans
}

/**
 * Compatibility adapter for legacy callers. New SSR and API paths should resolve
 * provider ownership once and call loadProviderRatePlansReadModel directly.
 */
export async function loadRatePlansReadModel(input: {
	providerId?: string
	request?: Request
	url?: URL
	checkIn?: string
	checkOut?: string
	channel?: string
	timing?: ServerTimingRecorder
}): Promise<RatePlanListItem[]> {
	let providerId = String(input.providerId ?? "").trim()
	if (!providerId) {
		if (!input.request) throw new Error("Provider id or request is required")
		providerId = (await requireProvider(input.request)).providerId
	}
	return loadProviderRatePlansReadModel({
		providerId,
		url: input.url ?? (input.request ? new URL(input.request.url) : undefined),
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		timing: input.timing,
	})
}

export async function loadRatePlanReadModelById(input: {
	providerId?: string
	request?: Request
	url?: URL
	ratePlanId: string
	checkIn?: string
	checkOut?: string
	channel?: string
}): Promise<RatePlanListItem | null> {
	const ratePlanId = String(input.ratePlanId ?? "").trim()
	if (!ratePlanId) return null
	const rows = await loadRatePlansReadModel(input)
	return rows.find((row) => String(row.ratePlanId) === ratePlanId) ?? null
}
