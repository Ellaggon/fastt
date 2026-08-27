/**
 * Validates a channel content draft against ownership invariants.
 */

import {
	isForbiddenHouseRuleCommercialKey,
	isForbiddenUnitHouseRuleType,
	PROPERTY_ONLY_HOUSE_RULE_TYPES,
} from "./channelContentOwnership"
import type { ChannelContentDraft } from "./channelContentProjection"

export type ChannelContentValidationIssue = {
	code: string
	message: string
	layer?: string
	sourceKey?: string
}

export function validateChannelContentDraft(
	draft: ChannelContentDraft
): ChannelContentValidationIssue[] {
	const issues: ChannelContentValidationIssue[] = []

	for (const rule of draft.property.houseRules) {
		if (isForbiddenHouseRuleCommercialKey(rule.type)) {
			issues.push({
				code: "property_has_commercial_house_rule",
				message: `House rule type ${rule.type} is a rate commercial policy`,
				layer: "property",
				sourceKey: rule.type,
			})
		}
	}

	for (const unit of draft.units) {
		const unitTypes = [
			...(unit.smoking ? [unit.smoking.type] : []),
			...unit.otherOverrides.map((r) => r.type),
		]
		for (const type of unitTypes) {
			if (isForbiddenUnitHouseRuleType(type)) {
				issues.push({
					code: "unit_has_property_only_rule",
					message: `${type} must stay property-only (${PROPERTY_ONLY_HOUSE_RULE_TYPES.join(", ")})`,
					layer: "unit",
					sourceKey: type,
				})
			}
			if (isForbiddenHouseRuleCommercialKey(type)) {
				issues.push({
					code: "unit_has_commercial_house_rule",
					message: `${type} belongs on rate commercial, not unit`,
					layer: "unit",
					sourceKey: type,
				})
			}
		}
	}

	for (const rate of draft.rateCommercial) {
		const hasAny = rate.cancellation || rate.payment || rate.noShow
		if (!hasAny) {
			issues.push({
				code: "rate_commercial_empty",
				message: `Rate ${rate.ratePlanId} commercial draft has no Cancellation/Payment/NoShow`,
				layer: "rate_commercial",
			})
		}
	}

	for (const exception of draft.rateScheduleExceptions) {
		if (!exception.checkInFrom || !exception.checkOutUntil) {
			issues.push({
				code: "rate_schedule_incomplete",
				message: `Rate ${exception.ratePlanId} arrival exception missing times`,
				layer: "rate_schedule_exception",
				sourceKey: "CheckIn",
			})
		}
	}

	return issues
}

export function assertValidChannelContentDraft(draft: ChannelContentDraft): void {
	const issues = validateChannelContentDraft(draft)
	if (issues.length) {
		throw new Error(`channel_content_invalid:${issues.map((i) => i.code).join(",")}`)
	}
}
