import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ rows: {} as Record<string, any>, fail: false, completed: false }))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	db: { execute: vi.fn(), insert: () => ({ values: vi.fn() }) },
	sql: () => "lock",
	AuditEvent: {},
}))
vi.mock("@/shared/infrastructure/db/client", () => ({
	withPostgresTransaction: async (work: () => Promise<unknown>) => {
		const before = structuredClone(state.rows)
		try {
			return await work()
		} catch (error) {
			state.rows = before
			throw error
		}
	},
}))
vi.mock("@/lib/commands/command-idempotency", () => ({
	commandPayloadHash: (value: unknown) => JSON.stringify(value),
	reserveCommandIdempotency: async () => ({ kind: "reserved", id: "command" }),
	completeCommandIdempotency: async () => {
		state.completed = true
	},
}))
vi.mock("@/lib/commercial-policy/ratification", () => ({
	loadCommercialPolicyForRatification: async (id: string) => state.rows[id] ?? null,
	ratifyCommercialTourPolicy: async ({ policyVersionId }: { policyVersionId: string }) => {
		state.rows[policyVersionId].status = "published"
	},
}))
vi.mock("@/lib/commercial-policy/policy-drafts", () => ({
	retireCommercialTourPolicy: async (id: string) => {
		if (state.fail && id.endsWith("ded388ccc0b8")) throw new Error("synthetic_retirement_failure")
		state.rows[id].status = "retired"
	},
}))
vi.mock("@/lib/commercial-policy/evaluate", () => ({ tourPolicyPublicationErrors: () => [] }))

import {
	laPazGuideCleanup as ids,
	previewCommercialPolicyPackage,
	ratifyCommercialPolicyPackage,
} from "@/lib/commercial-policy/package-ratification"

beforeEach(() => {
	state.fail = false
	state.completed = false
	state.rows = Object.fromEntries(
		[ids.draft, ...ids.retire].map((id) => [
			id,
			{
				id,
				label: "Synthetic policy",
				versionNumber: 2,
				status: id === ids.draft ? "draft" : "published",
				vertical: "tour",
				country: "BO",
				holderType: "persona_natural",
				effectiveFrom: new Date("2026-01-01"),
				effectiveTo: null,
				signatures: [],
				requirements: [],
				context: {
					composition: {
						kind: "admission",
						family: "platform_standards",
						replacesVersionIds: [ids.base],
						requiredFamilies: [
							"tourism",
							"regulated_place",
							"operational_resources",
							"platform_standards",
						],
					},
				},
			},
		])
	)
})

async function apply() {
	const preview = await previewCommercialPolicyPackage([ids.draft], true)
	expect(preview.retirements).toHaveLength(2)
	return ratifyCommercialPolicyPackage({
		versionIds: [ids.draft],
		cleanup: true,
		fingerprint: preview.fingerprint,
		approvalReference: "Synthetic review",
		approverUserId: "reviewer",
		idempotencyKey: "test-command",
		reviewedAreas: ["policy", "finance", "tour_operations"],
	})
}

it("publishes and retires both targets in one unit of work", async () => {
	await apply()
	expect(state.rows[ids.draft].status).toBe("published")
	expect(ids.retire.map((id) => state.rows[id].status)).toEqual(["retired", "retired"])
	expect(state.completed).toBe(true)
})

it("rolls back publication and the first retirement if the second retirement fails", async () => {
	state.fail = true
	await expect(apply()).rejects.toThrow("synthetic_retirement_failure")
	expect(state.rows[ids.draft].status).toBe("draft")
	expect(ids.retire.map((id) => state.rows[id].status)).toEqual(["published", "published"])
	expect(state.completed).toBe(false)
})

it("rejects a future admission before retiring any policy", async () => {
	state.rows[ids.draft].effectiveFrom = new Date("2099-01-01")
	await expect(apply()).rejects.toThrow("policy_package_invalid")
})
