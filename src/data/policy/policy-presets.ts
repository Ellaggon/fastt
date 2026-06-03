import type { PolicyCategory } from "@/modules/policies/domain/policy.category"
import type { CancellationTierInput } from "@/modules/policies/application/schemas/policy-write/policyContentSchema"

export type PolicyPresetKey =
	| "flexible"
	| "moderate"
	| "limited"
	| "firm"
	| "strict_legacy"
	| "long_term"
	| "non_refundable"
	| "pay_at_property"
	| "prepayment_full"
	| "deposit_50"
	| "standard_check_in"
	| "late_arrival"
	| "no_show_first_night"
	| "no_show_full_stay"
	| "no_show_percentage_100"

export type PolicyPreset = {
	key: PolicyPresetKey
	category: PolicyCategory
	name: string
	description: string
	guestFacing: string
	operationalMeaning: string
	stayLengthType: "any" | "short_stay" | "long_stay" | "monthly"
	gracePeriod: number
	refundBasis:
		| "total_booking"
		| "room_rate"
		| "first_night"
		| "deposit"
		| "provider_policy"
		| "none"
	payoutBasis: "gross" | "net" | "collected" | "provider_policy"
	localTimezone: string
	legalOverrideFlags: Record<string, boolean>
	rules: Record<string, unknown>
	cancellationTiers?: CancellationTierInput[]
}

const cancellationPreset = (
	preset: Omit<PolicyPreset, "category" | "localTimezone" | "legalOverrideFlags"> & {
		legalOverrideFlags?: Record<string, boolean>
	}
): PolicyPreset => ({
	...preset,
	category: "Cancellation",
	localTimezone: "property_local",
	legalOverrideFlags: preset.legalOverrideFlags ?? {},
})

export const POLICY_PRESET_CATALOG = [
	cancellationPreset({
		key: "flexible",
		name: "Flexible",
		description: "Free cancellation until 24 hours before check-in.",
		guestFacing: "Guests can cancel up to 1 day before arrival without a penalty.",
		operationalMeaning: "OTA-style flexible rate for broad public availability.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "collected",
		rules: {
			cancellationPreset: "flexible",
			freeCancellationUntilDaysBeforeArrival: 1,
			gracePeriodHoursAfterBooking: 24,
			refundBasis: "total_booking",
			refundTiers: [
				{ daysBeforeArrival: 1, refundPercentage: 100, penaltyPercentage: 0 },
				{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 },
			],
		},
		cancellationTiers: [
			{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "moderate",
		name: "Moderate",
		description: "Free cancellation until 5 days before check-in, then full penalty.",
		guestFacing: "Guests can cancel up to 5 days before arrival without a penalty.",
		operationalMeaning: "Balanced OTA default for standard refundable rates.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "collected",
		rules: {
			cancellationPreset: "moderate",
			freeCancellationUntilDaysBeforeArrival: 5,
			gracePeriodHoursAfterBooking: 24,
			refundBasis: "total_booking",
			refundTiers: [
				{ daysBeforeArrival: 5, refundPercentage: 100, penaltyPercentage: 0 },
				{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 },
			],
		},
		cancellationTiers: [
			{ daysBeforeArrival: 5, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "limited",
		name: "Limited",
		description: "Free cancellation until 7 days before check-in, then partial and full penalties.",
		guestFacing:
			"Guests can cancel up to 7 days before arrival without a penalty; later cancellation is partially refundable.",
		operationalMeaning: "OTA-style limited flexibility for dates that need stronger protection.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "collected",
		rules: {
			cancellationPreset: "limited",
			freeCancellationUntilDaysBeforeArrival: 7,
			gracePeriodHoursAfterBooking: 24,
			refundBasis: "total_booking",
			refundTiers: [
				{ daysBeforeArrival: 7, refundPercentage: 100, penaltyPercentage: 0 },
				{ daysBeforeArrival: 1, refundPercentage: 50, penaltyPercentage: 50 },
				{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 },
			],
		},
		cancellationTiers: [
			{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "firm",
		name: "Firm",
		description:
			"Free cancellation until 30 days before check-in, then partial and full penalties.",
		guestFacing:
			"Guests can cancel up to 30 days before arrival without a penalty; later cancellation is partially refundable.",
		operationalMeaning: "Firm OTA contract for high-demand or scarce inventory.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		rules: {
			cancellationPreset: "firm",
			freeCancellationUntilDaysBeforeArrival: 30,
			gracePeriodHoursAfterBooking: 24,
			refundBasis: "total_booking",
			refundTiers: [
				{ daysBeforeArrival: 30, refundPercentage: 100, penaltyPercentage: 0 },
				{ daysBeforeArrival: 7, refundPercentage: 50, penaltyPercentage: 50 },
				{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 },
			],
		},
		cancellationTiers: [
			{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "strict_legacy",
		name: "Strict / legacy",
		description: "Strict legacy cancellation with only early partial refund.",
		guestFacing:
			"Guests receive a partial refund only when cancellation happens well before arrival.",
		operationalMeaning: "Legacy strict preset retained for compatibility with older OTA contracts.",
		stayLengthType: "short_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		legalOverrideFlags: { strictLegacyDisclosureRequired: true },
		rules: {
			cancellationPreset: "strict_legacy",
			freeCancellationUntilDaysBeforeArrival: null,
			gracePeriodHoursAfterBooking: 24,
			refundBasis: "total_booking",
			refundTiers: [
				{ daysBeforeArrival: 14, refundPercentage: 50, penaltyPercentage: 50 },
				{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 },
			],
		},
		cancellationTiers: [
			{ daysBeforeArrival: 14, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "long_term",
		name: "Long-term",
		description: "Long-stay cancellation with 30-day free window and staged penalties.",
		guestFacing:
			"Guests booking longer stays can cancel up to 30 days before arrival without a penalty.",
		operationalMeaning: "Long-stay OTA contract for monthly or extended lodging inventory.",
		stayLengthType: "long_stay",
		gracePeriod: 24,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		rules: {
			cancellationPreset: "long_term",
			minStayNights: 28,
			freeCancellationUntilDaysBeforeArrival: 30,
			gracePeriodHoursAfterBooking: 24,
			refundBasis: "total_booking",
			refundTiers: [
				{ daysBeforeArrival: 30, refundPercentage: 100, penaltyPercentage: 0 },
				{ daysBeforeArrival: 7, refundPercentage: 50, penaltyPercentage: 50 },
				{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 },
			],
		},
		cancellationTiers: [
			{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 0 },
			{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 50 },
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
	}),
	cancellationPreset({
		key: "non_refundable",
		name: "Non-refundable",
		description: "Cancellation always carries a full penalty.",
		guestFacing: "If guests cancel, the booking is non-refundable.",
		operationalMeaning:
			"Use only when rate-plan packaging clearly discloses the non-refundable contract.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "none",
		payoutBasis: "gross",
		legalOverrideFlags: { nonRefundableDisclosureRequired: true },
		rules: {
			cancellationPreset: "non_refundable",
			freeCancellationUntilDaysBeforeArrival: null,
			gracePeriodHoursAfterBooking: 0,
			refundBasis: "none",
			refundTiers: [{ daysBeforeArrival: 0, refundPercentage: 0, penaltyPercentage: 100 }],
		},
		cancellationTiers: [{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 }],
	}),
	{
		key: "pay_at_property",
		category: "Payment",
		name: "Pay at property",
		description: "Guests pay at the property.",
		guestFacing: "Payment is collected by the property according to its local process.",
		operationalMeaning: "No platform prepayment is required before arrival.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "provider_policy",
		payoutBasis: "provider_policy",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: { paymentType: "pay_at_property" },
	},
	{
		key: "prepayment_full",
		category: "Payment",
		name: "Full prepayment",
		description: "Guests must prepay 100% before arrival.",
		guestFacing: "The full booking amount is due before arrival.",
		operationalMeaning: "Use with stricter cancellation policies or high-demand periods.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		localTimezone: "property_local",
		legalOverrideFlags: { requiresManualReview: false },
		rules: {
			paymentType: "prepayment",
			prepaymentPercentage: 100,
			prepaymentDaysBeforeArrival: 0,
		},
	},
	{
		key: "deposit_50",
		category: "Payment",
		name: "50% deposit",
		description: "Guests prepay a 50% deposit before arrival.",
		guestFacing: "A 50% prepayment is required to secure the reservation.",
		operationalMeaning: "Stores the payment contract as structured payment terms.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "deposit",
		payoutBasis: "collected",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: {
			paymentType: "prepayment",
			prepaymentPercentage: 50,
			prepaymentDaysBeforeArrival: 0,
		},
	},
	{
		key: "standard_check_in",
		category: "CheckIn",
		name: "Standard check-in",
		description: "Check-in from 15:00, check-out until 11:00.",
		guestFacing: "Check-in starts at 15:00 and check-out is until 11:00.",
		operationalMeaning: "Default operational window for most lodging providers.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "none",
		payoutBasis: "provider_policy",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: { checkInFrom: "15:00", checkInUntil: "22:00", checkOutUntil: "11:00" },
	},
	{
		key: "late_arrival",
		category: "CheckIn",
		name: "Late-arrival friendly",
		description: "Check-in from 15:00 until 00:00, check-out until 11:00.",
		guestFacing: "Guests may arrive later, until midnight.",
		operationalMeaning: "Use only when reception or self check-in can support late arrivals.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "none",
		payoutBasis: "provider_policy",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: { checkInFrom: "15:00", checkInUntil: "00:00", checkOutUntil: "11:00" },
	},
	{
		key: "no_show_first_night",
		category: "NoShow",
		name: "First-night no-show",
		description: "If the guest does not arrive, the first night is charged.",
		guestFacing: "If guests do not arrive, the first night is charged.",
		operationalMeaning: "Balanced default for flexible and moderate rates.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "first_night",
		payoutBasis: "gross",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: { penaltyType: "first_night" },
	},
	{
		key: "no_show_full_stay",
		category: "NoShow",
		name: "Full-stay no-show",
		description: "If the guest does not arrive, the full stay is charged.",
		guestFacing: "If guests do not arrive, the full booking amount is charged.",
		operationalMeaning: "Use for stricter or non-refundable rate plans.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: { penaltyType: "full" },
	},
	{
		key: "no_show_percentage_100",
		category: "NoShow",
		name: "100% no-show",
		description: "If the guest does not arrive, 100% of the booking is charged.",
		guestFacing: "If guests do not arrive, 100% of the booking amount is charged.",
		operationalMeaning: "Equivalent to a full penalty while keeping percentage semantics.",
		stayLengthType: "any",
		gracePeriod: 0,
		refundBasis: "total_booking",
		payoutBasis: "gross",
		localTimezone: "property_local",
		legalOverrideFlags: {},
		rules: { penaltyType: "percentage", penaltyAmount: 100 },
	},
] as const satisfies readonly PolicyPreset[]

export const POLICY_PRESETS = POLICY_PRESET_CATALOG.reduce(
	(acc, preset) => {
		acc[preset.category] ??= []
		acc[preset.category].push(preset)
		return acc
	},
	{} as Record<PolicyCategory, PolicyPreset[]>
)

const LEGACY_PRESET_ALIASES: Record<string, PolicyPresetKey> = {
	flex_24h: "flexible",
	moderate_7d: "moderate",
	standard: "standard_check_in",
	first_night: "no_show_first_night",
	full_stay: "no_show_full_stay",
	percentage_100: "no_show_percentage_100",
}

export function resolvePolicyPreset(
	key: string | null | undefined,
	category?: PolicyCategory
): PolicyPreset | null {
	const normalized = String(key ?? "").trim()
	if (!normalized) return null
	const canonicalKey = LEGACY_PRESET_ALIASES[normalized] ?? normalized
	const preset =
		POLICY_PRESET_CATALOG.find(
			(item) => item.key === canonicalKey && (!category || item.category === category)
		) ?? null
	return preset
}

export function clonePolicyPresetRules(preset: PolicyPreset): Record<string, unknown> {
	return structuredClone(preset.rules)
}

export function clonePolicyPresetCancellationTiers(
	preset: PolicyPreset
): CancellationTierInput[] | undefined {
	return preset.cancellationTiers ? structuredClone(preset.cancellationTiers) : undefined
}
