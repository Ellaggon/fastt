import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
	status: "verified",
	conflict: false,
	definitionKey: null as string | null,
	audit: vi.fn(),
	update: vi.fn(),
}))
vi.mock("@/shared/infrastructure/db/client", async (original) => ({
	...(await original<typeof import("@/shared/infrastructure/db/client")>()),
	withPostgresTransaction: async (run: () => Promise<unknown>) => run(),
}))
vi.mock("@/lib/provider-audit", async (original) => ({
	...(await original<typeof import("@/lib/provider-audit")>()),
	writeProviderAuditLog: state.audit,
}))
vi.mock("@/lib/provider-compliance-ops", () => ({ completeComplianceAssignment: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", async (original) => {
	const actual = await original<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...actual,
		db: {
			select: () => ({
				from: (table: unknown) => {
					const rows = () =>
						table === actual.ProviderDocument
							? [
									{
										id: "doc",
									definitionVersionId: state.definitionKey ? "definition-version" : null,
										providerId: "provider",
										type: "operating_license",
										status: state.status,
										metadataJson: {},
										fileUrl: null,
										expiresAt: null,
										reviewedBy: "previous-reviewer",
									},
								]
							: table === actual.DocumentDefinitionVersion && state.definitionKey
								? [{ key: state.definitionKey }] : []
					const query = {
						leftJoin: () => query,
						innerJoin: () => query,
						where: () => query,
						orderBy: () => Promise.resolve(rows()),
						then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
					}
					return query
				},
			}),
			update: () => ({
				set: (values: { status: string }) => {
					state.update(values)
					return {
						where: () => ({
							returning: async () => {
								if (state.conflict) return []
								state.status = values.status
								return [{ id: "doc" }]
							},
						}),
					}
				},
			}),
		},
	}
})
import { reviewProviderDocument } from "@/lib/provider-documents"

beforeEach(() => {
	state.status = "verified"
	state.conflict = false
	state.definitionKey = null
	state.audit.mockReset()
	state.update.mockReset()
})
const input = {
	providerId: "provider",
	actorUserId: "reviewer",
	documentId: "doc",
	status: "rejected",
	withdrawVerification: true,
	reviewNotes: "Suspension comunicada; ver expediente de respaldo.",
}

it("blocks coverage approval with unstructured notes before inspection or writes", async () => {
	state.status = "pending"
	for (const key of ["bo.tour.liability_insurance", "bo.tour.route_applicability_review"]) {
		state.definitionKey = key
		await expect(reviewProviderDocument({ ...input, status: "verified", withdrawVerification: false,
			reviewNotes: "Revisado sin criterios estructurados" })).rejects.toThrow("coverage_structured_review_required")
	}
	expect(state.update).not.toHaveBeenCalled()
	expect(state.audit).not.toHaveBeenCalled()
})

it("records actor, reason and before/after when verification is withdrawn", async () => {
	const result = await reviewProviderDocument(input)
	expect(result?.status).toBe("rejected")
	expect(state.audit).toHaveBeenCalledWith(
		expect.objectContaining({
			providerId: "provider",
			actorUserId: "reviewer",
			entityId: "doc",
			action: "provider.document.verification_withdrawn",
			beforeJson: expect.objectContaining({ status: "verified" }),
			afterJson: expect.objectContaining({ status: "rejected", reviewNotes: input.reviewNotes }),
		})
	)
})
it("does not emit a success audit after an optimistic concurrency conflict", async () => {
	state.conflict = true
	await expect(reviewProviderDocument(input)).rejects.toThrow("not_pending")
	expect(state.audit).not.toHaveBeenCalled()
})
it("keeps ordinary review from silently withdrawing a verified document", async () => {
	await expect(reviewProviderDocument({ ...input, withdrawVerification: false })).rejects.toThrow(
		"not_pending"
	)
	expect(state.update).not.toHaveBeenCalled()
})
