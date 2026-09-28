import { describe, expect, it } from "vitest"

import {
	classifyCommercialEvidenceMigration,
	classifyProviderVerticals,
} from "@/lib/commercial-policy/migration-audit"

describe("commercial evidence migration audit", () => {
	it("preserves historical evidence but never classifies it as permission-granting", () => {
		expect(
			classifyCommercialEvidenceMigration({ status: "verified", scopeCount: 0 })
		).toBe("legacy_generic_requires_scope")
		expect(
			classifyCommercialEvidenceMigration({ status: "verified", scopeCount: 1 })
		).toBe("scoped_requires_policy_match")
		expect(
			classifyCommercialEvidenceMigration({ status: "verified", scopeCount: 1, expiresAt: "2026-09-25" }, new Date("2026-09-26T12:00:00Z"))
		).toBe("expired_requires_renewal")
		expect(classifyCommercialEvidenceMigration({ status: "pending", scopeCount: 1 })).toBe(
			"pending_review"
		)
	})

	it("keeps hotel, tour and mixed providers in separate certification cohorts", () => {
		expect(classifyProviderVerticals(["Hotel"])).toBe("hotel")
		expect(classifyProviderVerticals(["Tour"])).toBe("tour")
		expect(classifyProviderVerticals(["Hotel", "Tour"])).toBe("mixed")
	})
})
