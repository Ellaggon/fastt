import { afterEach, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ send: vi.fn(), references: vi.fn() }))
vi.mock("@/container/shared.container", () => ({
	getDocumentR2Client: () => ({ send: mock.send }),
}))
vi.mock("@/shared/infrastructure/db/compat", async (original) => ({
	...(await original<object>()),
	db: { select: () => ({ from: () => ({ where: mock.references }) }) },
}))
import { auditProviderDocumentStorage } from "@/lib/documents/storage-reconciliation"
afterEach(() => {
	vi.unstubAllEnvs()
	vi.resetAllMocks()
})
function configure() {
	for (const [key, value] of Object.entries({
		R2_DOCUMENTS_ACCOUNT_ID: "test",
		R2_DOCUMENTS_BUCKET_NAME: "private-test",
		R2_DOCUMENTS_ACCESS_KEY_ID: "private",
		R2_DOCUMENTS_SECRET_ACCESS_KEY: "synthetic",
	}))
		vi.stubEnv(key, value)
}
it("paginates the private namespace and never deletes referenced, recent or unknown objects", async () => {
	configure()
	const old = new Date("2026-01-01"),
		now = new Date("2026-02-01")
	mock.send
		.mockResolvedValueOnce({
			Contents: [{ Key: "provider-documents/p/tracked/original", LastModified: old }],
			IsTruncated: true,
			NextContinuationToken: "next",
		})
		.mockResolvedValueOnce({
			Contents: [
				{ Key: "provider-documents/p/orphan/original", LastModified: old },
				{ Key: "provider-documents/p/recent/original", LastModified: now },
				{ Key: "provider-documents/unknown" },
			],
			IsTruncated: false,
		})
	mock.references
		.mockResolvedValueOnce([{ fileUrl: "r2-documents:provider-documents/p/tracked/original" }])
		.mockResolvedValueOnce([])
	const report = await auditProviderDocumentStorage({ now })
	expect(report.entries.map((item) => item.state)).toEqual([
		"referenced",
		"orphan_candidate",
		"recent_unconfirmed",
		"unknown_identity_or_age",
	])
	expect(mock.send.mock.calls[1][0].input.ContinuationToken).toBe("next")
	expect(
		mock.send.mock.calls.every(([command]) => command.constructor.name === "ListObjectsV2Command")
	).toBe(true)
	expect(mock.send.mock.calls[0][0].input.Bucket).toBe("private-test")
})
it("fails closed if PostgreSQL cannot confirm references", async () => {
	configure()
	mock.send.mockResolvedValue({ Contents: [{ Key: "provider-documents/p/doc/original" }] })
	mock.references.mockRejectedValue(new Error("database unavailable"))
	await expect(auditProviderDocumentStorage()).rejects.toThrow("database unavailable")
})
it("refuses an incomplete pagination response or a shortened grace period", async () => {
	configure()
	mock.send.mockResolvedValue({ IsTruncated: true })
	await expect(auditProviderDocumentStorage()).rejects.toThrow("pagination_incomplete")
	await expect(auditProviderDocumentStorage({ minimumAgeHours: 1 })).rejects.toThrow(
		"at_least_24_hours"
	)
})
