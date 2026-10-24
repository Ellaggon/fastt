import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
	legacyEnabled: true,
	commandsEnabled: false,
	inPilot: false,
	cases: [["case-a", "open", "standard"]] as string[][],
	decisions: [] as string[][],
	unsafe: vi.fn(),
}))
vi.mock("@/config/featureFlags", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/config/featureFlags")>()),
	getFeatureFlag: (name: string) =>
		name === "COMMAND_CENTER_LEGACY_WRITE_ENABLED" ? state.legacyEnabled : state.commandsEnabled,
	isCommandCenterV2PilotProvider: () => state.inPilot,
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()
	const { drizzle } = await import("drizzle-orm/postgres-js")
	return {
		...original,
		db: drizzle({ options: { parsers: {}, serializers: {} }, unsafe: state.unsafe } as never),
	}
})
import { assertLegacyComplianceReviewAllowed } from "@/lib/casework/compliance-casework"

const source = {
	providerId: "provider-a",
	domain: "documents" as const,
	sourceType: "ProviderDocument",
	sourceRef: "document-a",
}
describe("legacy compliance writer eligibility", () => {
	beforeEach(() => {
		state.legacyEnabled = true
		state.commandsEnabled = false
		state.inPilot = false
		state.cases = [["case-a", "open", "standard"]]
		state.decisions = []
		state.unsafe
			.mockReset()
			.mockImplementation((query: string) => ({
				values: async () =>
					query.includes('from "ComplianceCase"') ? state.cases : state.decisions,
			}))
	})
	it("locks only active cases for the exact provider and source before allowing review", async () => {
		await expect(assertLegacyComplianceReviewAllowed(source)).resolves.toBeUndefined()
		const [query, params] = state.unsafe.mock.calls[0]
		expect(query).toContain("for update")
		expect(params.slice(0, 4)).toEqual([
			"provider-a",
			"documents",
			"ProviderDocument",
			"document-a",
		])
	})
	it("honors the legacy writer switch before querying sources", async () => {
		state.legacyEnabled = false
		await expect(assertLegacyComplianceReviewAllowed(source)).rejects.toMatchObject({
			message: "legacy_review_disabled",
			status: 503,
		})
		expect(state.unsafe).not.toHaveBeenCalled()
	})
	it("blocks pending second approval before a source mutation", async () => {
		state.decisions = [["decision-a"]]
		await expect(assertLegacyComplianceReviewAllowed(source)).rejects.toThrow(
			"casework_decision_pending"
		)
	})
	it.each(["high", "elevated"])("keeps %s risk in the case decision workflow", async (risk) => {
		state.cases = [["case-a", "open", risk]]
		await expect(assertLegacyComplianceReviewAllowed(source)).rejects.toThrow(
			"casework_review_required"
		)
	})
	it("waits for the provider response before another review", async () => {
		state.cases = [["case-a", "waiting_information", "standard"]]
		await expect(assertLegacyComplianceReviewAllowed(source)).rejects.toThrow(
			"case_waiting_information"
		)
	})
	it("uses the enabled case writer for providers already in its pilot", async () => {
		state.commandsEnabled = true
		state.inPilot = true
		await expect(assertLegacyComplianceReviewAllowed(source)).rejects.toThrow(
			"casework_review_required"
		)
	})
})
