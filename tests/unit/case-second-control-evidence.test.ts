import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
	revision: "original",
	blockers: [] as string[],
	apply: vi.fn(),
	authorized: true,
	pilot: true,
}))
vi.mock("@/config/featureFlags", () => ({
	getFeatureFlag: () => true,
	isCommandCenterV2PilotProvider: () => state.pilot,
}))
vi.mock("@/lib/auth/internal-authorization", () => ({
	requireInternalPermission: async () => {
		if (!state.authorized) throw new Response(null, { status: 403 })
		return { user: { id: "checker" }, roles: ["risk_approver"] }
	},
}))
vi.mock("@/lib/auth/internal-step-up", () => ({
	requireRecentInternalAuthentication: async () => undefined,
}))
vi.mock("@/lib/commands/sensitive-command", () => ({
	executeSensitiveCommand: async (options: any) => {
		await options.authorize()
		return { response: (await options.execute()).response, replayed: false }
	},
}))
vi.mock("@/lib/commands/command-idempotency", () => ({
	idempotencyKeyFromRequest: () => "key",
	IdempotencyConflictError: class extends Error {},
}))
vi.mock("@/lib/http/request-context", () => ({
	requestIdFromRequest: () => "request",
	withRequestId: (response: Response) => response,
}))
vi.mock("@/modules/casework/public", () => ({
	getDecisionAuthorizationContext: async () => ({
		caseId: "case",
		providerId: "fixture",
		domain: "fiscal",
	}),
	getCaseWorkspace: async () => ({
		decisions: [
			{
				id: "proposal",
				decision: "approved",
				evidenceSnapshotJson: { evidenceRevision: "original" },
			},
		],
	}),
	getCaseEvidence: async () => ({ revision: state.revision, approvalBlockers: state.blockers }),
	approveAndApplyCaseDecision: (...args: unknown[]) => state.apply(...args),
}))
import { POST } from "@/pages/api/admin/v1/decisions/[decisionId]/approve"

const invoke = () =>
	POST({
		request: new Request("http://localhost/api/admin/v1/decisions/proposal/approve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ caseVersion: 2 }),
		}),
		params: { decisionId: "proposal" },
	} as any)

describe("second control checks the evidence at application time", () => {
	beforeEach(() => {
		state.revision = "original"
		state.blockers = []
		state.authorized = true
		state.pilot = true
		state.apply.mockReset().mockResolvedValue({ applied: true })
	})
	it("rejects changed evidence without applying the decision", async () => {
		state.revision = "replaced-document"
		const response = await invoke()
		expect(response.status).toBe(409)
		expect(await response.json()).toMatchObject({ error: "case_evidence_changed" })
		expect(state.apply).not.toHaveBeenCalled()
	})
	it("rejects an approval with new evidence blockers", async () => {
		state.blockers = ["quarantined"]
		expect((await invoke()).status).toBe(422)
		expect(state.apply).not.toHaveBeenCalled()
	})
	it("keeps permissions enforced", async () => {
		state.authorized = false
		expect((await invoke()).status).toBe(403)
		expect(state.apply).not.toHaveBeenCalled()
	})
	it("keeps the pilot boundary enforced", async () => {
		state.pilot = false
		expect((await invoke()).status).toBe(403)
		expect(state.apply).not.toHaveBeenCalled()
	})
	it("allows unchanged, complete evidence through the normal application command", async () => {
		expect((await invoke()).status).toBe(200)
		expect(state.apply).toHaveBeenCalledWith(
			expect.objectContaining({ actorUserId: "checker", decisionId: "proposal" })
		)
	})
})
