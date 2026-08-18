import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { SIDEBAR_DISCLOSURE_THRESHOLDS, resolveDisclosureMode } from "@/lib/dashboard/providerSidebarReadiness"
import {
	resolveProviderWorkspaceCapabilities,
	resolveWorkspaceExperience,
} from "@/lib/workspace/providerWorkspaceCapabilities"

describe("provider member workspace experience", () => {
	it("maps disclosure mode from member workspace experience", () => {
		const baseMetrics = {
			ratePlanIds: [],
			variantIds: [],
			activePriceRules: 0,
			activeRestrictions: 0,
		}

		expect(resolveDisclosureMode(baseMetrics, { workspaceExperience: "professional" })).toBe(
			"professional-tools"
		)
		expect(resolveDisclosureMode(baseMetrics, { providerRole: "admin" })).toBe("professional-tools")
	})

	it("keeps enterprise capabilities, member preference, and role enforcement separate", () => {
		const smallCapabilities = resolveProviderWorkspaceCapabilities({
			ratePlanCount: 1,
			variantCount: 1,
			activePriceRuleCount: 0,
			activeRestrictionCount: 0,
		})
		expect(smallCapabilities.requiresProfessionalExperience).toBe(false)
		expect(
			resolveWorkspaceExperience({
				preference: "professional",
				capabilities: smallCapabilities,
			})
		).toMatchObject({ effective: "professional", source: "preference", lockedReason: null })

		const scaledCapabilities = resolveProviderWorkspaceCapabilities({
			ratePlanCount: SIDEBAR_DISCLOSURE_THRESHOLDS.ratePlans,
			variantCount: 1,
			activePriceRuleCount: 0,
			activeRestrictionCount: 0,
		})
		expect(scaledCapabilities.canUseMultiCalendar).toBe(true)
		expect(
			resolveWorkspaceExperience({
				preference: "essential",
				capabilities: scaledCapabilities,
			})
		).toMatchObject({ effective: "professional", source: "enterprise-scale" })
		expect(
			resolveWorkspaceExperience({
				preference: "essential",
				providerRole: "revenue_ops",
				capabilities: smallCapabilities,
			})
		).toMatchObject({ effective: "professional", source: "role" })
	})

	it("persists workspace experience per provider member", () => {
		const config = readFileSync(join(process.cwd(), "src/shared/infrastructure/db/schema/tables.ts"), "utf8")
		const migration = readFileSync(
			join(process.cwd(), "db/migrations/2026-08-17_provider_user_workspace_experience.sql"),
			"utf8"
		)
		const preferences = readFileSync(
			join(process.cwd(), "src/lib/providerUserWorkspacePreference.ts"),
			"utf8"
		)
		const endpoint = readFileSync(
			join(process.cwd(), "src/pages/api/provider/preferences/professional-tools.ts"),
			"utf8"
		)

		expect(config).toContain("workspaceExperience")
		expect(config).toContain("workspaceExperienceUpdatedAt")
		expect(migration).toContain('ALTER TABLE "ProviderUser"')
		expect(migration).toContain('"workspaceExperience"')
		expect(migration).toContain('"ProviderUser_workspaceExperience_check"')
		expect(preferences).toContain("getProviderUserWorkspacePreferenceRead")
		expect(preferences).toContain("setProviderUserWorkspaceExperience")
		expect(preferences).toContain("schemaAvailable")
		expect(endpoint).toContain("setProviderUserWorkspaceExperience")
		expect(endpoint).not.toContain("ProviderProfile")
		expect(endpoint).not.toContain("PROFESSIONAL_MODE_COOKIE")
		expect(endpoint).toContain('persisted: "member_preference"')
	})

	it("treats workspace experience as a member-only presentation preference", () => {
		const preferences = readFileSync(
			join(process.cwd(), "src/lib/providerUserWorkspacePreference.ts"),
			"utf8"
		)
		const invalidation = readFileSync(join(process.cwd(), "src/lib/cache/invalidation.ts"), "utf8")

		expect(preferences).toContain('entity: "ProviderUser"')
		expect(preferences).not.toContain("ProviderProfile)")
		expect(invalidation).toContain("invalidateProviderWorkspaceExperience")
		expect(existsSync(join(process.cwd(), "src/lib/providerProfessionalToolsPreference.ts"))).toBe(false)
		expect(existsSync(join(process.cwd(), "src/lib/dashboard/professionalModeCookie.ts"))).toBe(false)
	})
})
