import { z } from "zod"
import type { PolicyCategory } from "../../../domain/policy.category"
import { PolicyValidationError, type ValidationIssue } from "../../errors/policyValidationError"

export const cancellationTierSchema = z.object({
	daysBeforeArrival: z.number().int().min(0),
	penaltyType: z.enum(["percentage", "nights"]),
	penaltyAmount: z.number().min(0),
})

export type CancellationTierInput = z.infer<typeof cancellationTierSchema>

const paymentTypes = ["pay_at_property", "prepayment", "prepaid"] as const
const noShowPenaltyTypes = ["first_night", "full", "percentage"] as const
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function rulesRecord(rules: Record<string, unknown> | undefined): Record<string, unknown> {
	return rules && typeof rules === "object" && !Array.isArray(rules) ? rules : {}
}

function textRule(rules: Record<string, unknown>, key: string): string {
	return String(rules[key] ?? "").trim()
}

function optionalNumber(value: unknown): number | null {
	if (value == null || value === "") return null
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

function assertNoIssues(issues: ValidationIssue[]) {
	if (issues.length) throw new PolicyValidationError(issues)
}

function validateCancellationTiers(tiers: CancellationTierInput[] | undefined) {
	const issues: ValidationIssue[] = []
	if (!tiers?.length) {
		throw new PolicyValidationError([{ path: ["cancellationTiers"], code: "required" }])
	}

	const byDay = new Set<number>()
	for (const tier of tiers) {
		if (byDay.has(tier.daysBeforeArrival)) {
			issues.push({ path: ["cancellationTiers"], code: "duplicate_days_before_arrival" })
		}
		byDay.add(tier.daysBeforeArrival)

		if (tier.penaltyType === "percentage" && tier.penaltyAmount > 100) {
			issues.push({ path: ["cancellationTiers"], code: "invalid_percentage_penalty" })
		}
		if (tier.penaltyType === "nights" && !Number.isInteger(tier.penaltyAmount)) {
			issues.push({ path: ["cancellationTiers"], code: "invalid_nights_penalty" })
		}
	}

	const sorted = [...tiers].sort((a, b) => b.daysBeforeArrival - a.daysBeforeArrival)
	let previousPenalty = -Infinity
	for (const tier of sorted) {
		if (tier.penaltyAmount < previousPenalty) {
			issues.push({
				path: ["cancellationTiers"],
				code: "non_monotonic_penalty",
				message: "Penalty must not decrease as arrival gets closer",
			})
			break
		}
		previousPenalty = tier.penaltyAmount
	}

	assertNoIssues(issues)
	return tiers
}

function validateCancellationRules(rules: Record<string, unknown> | undefined) {
	const input = rulesRecord(rules)
	const duplicatedSources = [
		"cancellationPreset",
		"stayLengthType",
		"freeCancellationUntilDaysBeforeArrival",
		"gracePeriodHoursAfterBooking",
		"refundBasis",
		"hostPayoutBasis",
		"refundTiers",
	]
	const duplicatedKey = duplicatedSources.find((key) => input[key] !== undefined)
	if (duplicatedKey) {
		throw new PolicyValidationError([
			{
				path: ["rules", duplicatedKey],
				code: "duplicated_contract_source",
				message: "Use Policy metadata or CancellationTier as the canonical source",
			},
		])
	}

	const normalized: Record<string, unknown> = {}
	for (const key of [
		"minStayNights",
		"maxStayNights",
		"stayLengthThresholdNights",
		"gracePeriodRequiresDaysBeforeArrival",
		"taxesFeesBasis",
		"taxRefundProration",
	]) {
		if (input[key] !== undefined) normalized[key] = input[key]
	}
	return Object.keys(normalized).length ? normalized : undefined
}

function validatePaymentRules(rules: Record<string, unknown> | undefined) {
	const input = rulesRecord(rules)
	const paymentType = textRule(input, "paymentType")
	const issues: ValidationIssue[] = []

	if (!paymentTypes.includes(paymentType as (typeof paymentTypes)[number])) {
		issues.push({
			path: ["rules", "paymentType"],
			code: "invalid_payment_type",
			message: "Choose pay at property, prepayment, or prepaid",
		})
	}

	const normalized: Record<string, unknown> = { paymentType }
	if (paymentType === "prepayment") {
		const percentage = optionalNumber(input.prepaymentPercentage)
		if (percentage == null || percentage <= 0 || percentage > 100) {
			issues.push({
				path: ["rules", "prepaymentPercentage"],
				code: "invalid_prepayment_percentage",
				message: "Prepayment must be between 1 and 100",
			})
		} else {
			normalized.prepaymentPercentage = percentage
		}
	}

	const daysBeforeArrival = optionalNumber(input.prepaymentDaysBeforeArrival)
	if (daysBeforeArrival != null) {
		if (!Number.isInteger(daysBeforeArrival) || daysBeforeArrival < 0) {
			issues.push({
				path: ["rules", "prepaymentDaysBeforeArrival"],
				code: "invalid_days_before_arrival",
			})
		} else {
			normalized.prepaymentDaysBeforeArrival = daysBeforeArrival
		}
	}

	assertNoIssues(issues)
	return normalized
}

function validateCheckInRules(rules: Record<string, unknown> | undefined) {
	const input = rulesRecord(rules)
	const checkInFrom = textRule(input, "checkInFrom")
	const checkInUntil = textRule(input, "checkInUntil")
	const checkOutUntil = textRule(input, "checkOutUntil")
	const issues: ValidationIssue[] = []

	for (const [key, value] of Object.entries({ checkInFrom, checkInUntil, checkOutUntil })) {
		if (!timePattern.test(value)) {
			issues.push({
				path: ["rules", key],
				code: "invalid_time",
				message: "Use HH:MM 24-hour time",
			})
		}
	}

	if (
		timePattern.test(checkInFrom) &&
		timePattern.test(checkInUntil) &&
		checkInFrom !== "00:00" &&
		checkInUntil !== "00:00" &&
		checkInUntil < checkInFrom
	) {
		issues.push({
			path: ["rules", "checkInUntil"],
			code: "invalid_time_order",
			message: "Check-in until must be later than check-in from",
		})
	}

	assertNoIssues(issues)
	return { checkInFrom, checkInUntil, checkOutUntil }
}

function validateNoShowRules(rules: Record<string, unknown> | undefined) {
	const input = rulesRecord(rules)
	const penaltyType = textRule(input, "penaltyType")
	const issues: ValidationIssue[] = []

	if (!noShowPenaltyTypes.includes(penaltyType as (typeof noShowPenaltyTypes)[number])) {
		issues.push({
			path: ["rules", "penaltyType"],
			code: "invalid_no_show_penalty_type",
			message: "Choose first night, full stay, or percentage",
		})
	}

	const normalized: Record<string, unknown> = { penaltyType }
	if (penaltyType === "percentage") {
		const amount = optionalNumber(input.penaltyAmount)
		if (amount == null || amount < 0 || amount > 100) {
			issues.push({
				path: ["rules", "penaltyAmount"],
				code: "invalid_no_show_percentage",
				message: "Percentage must be between 0 and 100",
			})
		} else {
			normalized.penaltyAmount = amount
		}
	}

	assertNoIssues(issues)
	return normalized
}

export function validatePolicyContentForCategory(params: {
	category: PolicyCategory
	rules?: Record<string, unknown>
	cancellationTiers?: CancellationTierInput[]
}): {
	rules?: Record<string, unknown>
	cancellationTiers?: CancellationTierInput[]
} {
	switch (params.category) {
		case "Cancellation":
			return {
				rules: validateCancellationRules(params.rules),
				cancellationTiers: validateCancellationTiers(params.cancellationTiers),
			}
		case "Payment":
			return { rules: validatePaymentRules(params.rules) }
		case "CheckIn":
			return { rules: validateCheckInRules(params.rules) }
		case "NoShow":
			return { rules: validateNoShowRules(params.rules) }
		default:
			return { rules: params.rules, cancellationTiers: params.cancellationTiers }
	}
}
