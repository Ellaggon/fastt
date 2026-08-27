import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
	CHANNEL_CONTENT_LAYERS,
	CHANNEL_CONTENT_OWNERSHIP,
	CHECK_IN_POLICY_LAYER_BY_SCOPE,
	EXPEDIA_LAYER_SEPARATION,
	PROPERTY_ONLY_HOUSE_RULE_TYPES,
	RATE_COMMERCIAL_POLICY_CATEGORIES,
	assertChannelContentPlacement,
	isForbiddenHouseRuleCommercialKey,
	isForbiddenRateHouseRuleType,
	isForbiddenUnitHouseRuleType,
	ownershipCoverageGaps,
	resolveChannelContentLayer,
} from "@/lib/channel-manager/content"
import { createChannelManagerContentAdapter } from "@/lib/channel-manager/channel-manager-content-adapter"
import { HOUSE_RULE_TYPES } from "@/modules/house-rules/public"

function read(relativePath: string) {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("guardrails/channel content ownership", () => {
	it("covers every house-rule type and policy category without gaps", () => {
		expect(ownershipCoverageGaps()).toEqual([])
		expect(CHANNEL_CONTENT_LAYERS).toEqual([
			"property",
			"unit",
			"rate_commercial",
			"rate_schedule_exception",
		])
		expect(CHANNEL_CONTENT_OWNERSHIP.length).toBeGreaterThan(20)
	})

	it("locks Expedia/Booking layering: property smoking, unit smoking, rate cancellation", () => {
		expect(resolveChannelContentLayer("house_rule_product", "Smoking")).toBe("property")
		expect(resolveChannelContentLayer("house_rule_variant", "Smoking")).toBe("unit")
		expect(resolveChannelContentLayer("policy_assignment_rate_plan", "Cancellation")).toBe(
			"rate_commercial"
		)
		expect(resolveChannelContentLayer("policy_assignment_rate_plan", "Payment")).toBe(
			"rate_commercial"
		)
		expect(resolveChannelContentLayer("policy_assignment_rate_plan", "NoShow")).toBe(
			"rate_commercial"
		)
		expect(CHECK_IN_POLICY_LAYER_BY_SCOPE.product).toBe("property")
		expect(CHECK_IN_POLICY_LAYER_BY_SCOPE.rate_plan).toBe("rate_schedule_exception")
		expect(EXPEDIA_LAYER_SEPARATION).toEqual([
			"property_policies",
			"unit_attributes",
			"rate_commercial",
		])
	})

	it("forbids commercial policies as house rules and property-only types on unit/rate", () => {
		for (const category of RATE_COMMERCIAL_POLICY_CATEGORIES) {
			expect(isForbiddenHouseRuleCommercialKey(category)).toBe(true)
		}
		for (const type of PROPERTY_ONLY_HOUSE_RULE_TYPES) {
			expect(isForbiddenUnitHouseRuleType(type)).toBe(true)
		}
		for (const type of HOUSE_RULE_TYPES) {
			expect(isForbiddenRateHouseRuleType(type)).toBe(true)
		}
		expect(() =>
			assertChannelContentPlacement({
				sourceKind: "house_rule_variant",
				sourceKey: "Smoking",
				intendedLayer: "rate_commercial",
			})
		).toThrow(/channel_content_misplaced/)
		expect(() =>
			assertChannelContentPlacement({
				sourceKind: "policy_assignment_rate_plan",
				sourceKey: "Cancellation",
				intendedLayer: "property",
			})
		).toThrow(/channel_content_misplaced/)
	})

	it("keeps content adapter separate from ARI and deferred (null factory)", () => {
		expect(createChannelManagerContentAdapter()).toBeNull()

		const ari = read("src/lib/channel-manager/channel-manager-adapter.ts")
		const content = read("src/lib/channel-manager/channel-manager-content-adapter.ts")
		const channex = read("src/lib/channel-manager/channex/channex-adapter.ts")

		expect(ari).not.toContain("HouseRule")
		expect(ari).not.toContain("Cancellation")
		expect(ari).not.toContain("pushContent")
		expect(content).toContain("pushContent")
		expect(content).toContain("return null")
		expect(channex).not.toContain("pushContent")
		expect(channex).not.toContain("HouseRule")
	})

	it("documents ADR and runbook ownership so UI/sync cannot silently mix layers", () => {
		const adr = read("docs/engineering/adr/0005-channel-content-ownership.md")
		const runbook = read("docs/engineering/provider-integration-operations-runbook.md")
		const taxonomy = read("docs/engineering/rooms-rates-table-taxonomy.md")
		const houseRulesDomain = read("src/modules/house-rules/domain/houseRule.ts")

		expect(adr).toContain("accepted (ownership contract)")
		expect(adr).toContain("deferred (outbound HTTP content push)")
		expect(adr).toContain("Rate commercial")
		expect(adr).toContain("Cancellation")
		expect(runbook).toContain("Content layers vs ARI")
		expect(runbook).toContain("Unit smoking")
		expect(taxonomy).toContain("HouseRule")
		expect(taxonomy).toContain("0005-channel-content-ownership")
		expect(houseRulesDomain).not.toContain("Cancellation")
	})
})
