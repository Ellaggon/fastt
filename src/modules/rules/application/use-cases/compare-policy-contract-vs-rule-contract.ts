import type { HoldPolicySnapshot } from "@/modules/policies/public"
import type { RuleBasedContractSnapshot } from "./build-rule-based-contract-snapshot"

type Category = "cancellation" | "payment" | "no_show" | "check_in"
type DiffKind =
	| "missing_category"
	| "penalty_diff"
	| "cancellation_window_diff"
	| "payment_timing_diff"
	| "no_show_rule_diff"
	| "structure_diff"

export type PolicyRuleContractDiff = {
	category: Category
	diffKind: DiffKind
	details: string
	policyValue: unknown
	ruleValue: unknown
}

export type PolicyRuleContractComparison = {
	isConsistent: boolean
	diffs: PolicyRuleContractDiff[]
}

function stableJson(value: unknown): string {
	const visit = (input: unknown): unknown => {
		if (Array.isArray(input)) return input.map((item) => visit(item))
		if (input && typeof input === "object") {
			const source = input as Record<string, unknown>
			const out: Record<string, unknown> = {}
			for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b))) {
				out[key] = visit(source[key])
			}
			return out
		}
		return input
	}
	return JSON.stringify(visit(value))
}

function toRulesMap(rows: unknown[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const row of Array.isArray(rows) ? rows : []) {
		if (!row || typeof row !== "object") continue
		const key = String((row as any).ruleKey ?? "").trim()
		if (!key) continue
		out[key] = (row as any).ruleValue
	}
	return out
}

function normalizePolicyTiers(rows: unknown[]): Array<{
	daysBeforeArrival: number
	penaltyType: string
	penaltyAmount: number | null
}> {
	return (Array.isArray(rows) ? rows : [])
		.map((row) => {
			if (!row || typeof row !== "object") return null
			const source = row as Record<string, unknown>
			const daysBeforeArrival = Number(source.daysBeforeArrival ?? NaN)
			if (!Number.isFinite(daysBeforeArrival)) return null
			const penaltyType = String(source.penaltyType ?? "")
				.trim()
				.toLowerCase()
			const penaltyAmountRaw = source.penaltyAmount
			const penaltyAmount =
				penaltyAmountRaw == null || !Number.isFinite(Number(penaltyAmountRaw))
					? null
					: Number(penaltyAmountRaw)
			return { daysBeforeArrival, penaltyType, penaltyAmount }
		})
		.filter(
			(
				row
			): row is {
				daysBeforeArrival: number
				penaltyType: string
				penaltyAmount: number | null
			} => Boolean(row)
		)
		.sort((a, b) => a.daysBeforeArrival - b.daysBeforeArrival)
}

function normalizeRuleTiers(rows: unknown[]): Array<{
	daysBeforeArrival: number
	penaltyType: string
	penaltyAmount: number | null
}> {
	return normalizePolicyTiers(rows)
}

function compareCategoryPresence(
	category: Category,
	policyRow: unknown | null | undefined,
	ruleRow: unknown | null | undefined,
	diffs: PolicyRuleContractDiff[]
): boolean {
	const hasPolicy = Boolean(policyRow)
	const hasRule = Boolean(ruleRow)
	if (hasPolicy === hasRule) return true
	diffs.push({
		category,
		diffKind: "missing_category",
		details: hasPolicy
			? "policy contract has category but rule contract is missing"
			: "rule contract has category but policy contract is missing",
		policyValue: policyRow ?? null,
		ruleValue: ruleRow ?? null,
	})
	return false
}

export function comparePolicyContractVsRuleContract(
	policySnapshot: HoldPolicySnapshot,
	ruleContractSnapshot: RuleBasedContractSnapshot
): PolicyRuleContractComparison {
	const diffs: PolicyRuleContractDiff[] = []
	const categories: Category[] = ["cancellation", "payment", "no_show", "check_in"]

	for (const category of categories) {
		const policyRow = (policySnapshot as any)?.[category] ?? null
		const ruleRow = (ruleContractSnapshot as any)?.[category] ?? null
		if (!compareCategoryPresence(category, policyRow, ruleRow, diffs)) continue
		if (!policyRow || !ruleRow) continue

		const policyRules = toRulesMap(Array.isArray(policyRow.rules) ? policyRow.rules : [])
		const ruleRules =
			ruleRow.rules && typeof ruleRow.rules === "object" && !Array.isArray(ruleRow.rules)
				? (ruleRow.rules as Record<string, unknown>)
				: null
		if (!ruleRules) {
			diffs.push({
				category,
				diffKind: "structure_diff",
				details: "rule contract missing rules object",
				policyValue: policyRules,
				ruleValue: ruleRow.rules ?? null,
			})
			continue
		}

		if (category === "cancellation") {
			const policyTiers = normalizePolicyTiers(
				Array.isArray(policyRow.cancellationTiers) ? policyRow.cancellationTiers : []
			)
			const ruleTiers = normalizeRuleTiers(
				Array.isArray(ruleRow.cancellationTiers) ? ruleRow.cancellationTiers : []
			)
			const policyWindows = policyTiers.map((tier) => tier.daysBeforeArrival)
			const ruleWindows = ruleTiers.map((tier) => tier.daysBeforeArrival)
			if (stableJson(policyWindows) !== stableJson(ruleWindows)) {
				diffs.push({
					category,
					diffKind: "cancellation_window_diff",
					details: "cancellation windows differ",
					policyValue: policyWindows,
					ruleValue: ruleWindows,
				})
			}
			const policyPenalties = policyTiers.map((tier) => ({
				daysBeforeArrival: tier.daysBeforeArrival,
				penaltyType: tier.penaltyType,
				penaltyAmount: tier.penaltyAmount,
			}))
			const rulePenalties = ruleTiers.map((tier) => ({
				daysBeforeArrival: tier.daysBeforeArrival,
				penaltyType: tier.penaltyType,
				penaltyAmount: tier.penaltyAmount,
			}))
			if (stableJson(policyPenalties) !== stableJson(rulePenalties)) {
				diffs.push({
					category,
					diffKind: "penalty_diff",
					details: "cancellation penalties differ",
					policyValue: policyPenalties,
					ruleValue: rulePenalties,
				})
			}
			continue
		}

		if (category === "payment") {
			const keys = [
				"paymentType",
				"prepaymentPercentage",
				"paymentDeadlineDays",
				"prepaymentDeadline",
			]
			const pick = (source: Record<string, unknown>) =>
				Object.fromEntries(keys.map((key) => [key, source[key] ?? null]))
			const policyTiming = pick(policyRules)
			const ruleTiming = pick(ruleRules)
			if (stableJson(policyTiming) !== stableJson(ruleTiming)) {
				diffs.push({
					category,
					diffKind: "payment_timing_diff",
					details: "payment timing differs",
					policyValue: policyTiming,
					ruleValue: ruleTiming,
				})
			}
			continue
		}

		if (category === "no_show") {
			const keys = ["penaltyType", "penaltyAmount", "chargeNights"]
			const pick = (source: Record<string, unknown>) =>
				Object.fromEntries(keys.map((key) => [key, source[key] ?? null]))
			const policyNoShow = pick(policyRules)
			const ruleNoShow = pick(ruleRules)
			if (stableJson(policyNoShow) !== stableJson(ruleNoShow)) {
				diffs.push({
					category,
					diffKind: "no_show_rule_diff",
					details: "no-show rules differ",
					policyValue: policyNoShow,
					ruleValue: ruleNoShow,
				})
			}
			continue
		}

		if (category === "check_in") {
			const keys = ["checkInFrom", "checkInUntil", "checkOutUntil"]
			const pick = (source: Record<string, unknown>) =>
				Object.fromEntries(keys.map((key) => [key, source[key] ?? null]))
			const policyCheckIn = pick(policyRules)
			const ruleCheckIn = pick(ruleRules)
			if (stableJson(policyCheckIn) !== stableJson(ruleCheckIn)) {
				diffs.push({
					category,
					diffKind: "structure_diff",
					details: "check-in/check-out rules differ",
					policyValue: policyCheckIn,
					ruleValue: ruleCheckIn,
				})
			}
		}
	}

	return {
		isConsistent: diffs.length === 0,
		diffs,
	}
}
