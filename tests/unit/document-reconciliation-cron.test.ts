import { afterEach, beforeEach, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ worker: vi.fn(), audit: vi.fn(), configured: vi.fn() }))
vi.mock("@/lib/documents/document-processing", () => ({
	runProviderDocumentProcessingWorker: mock.worker,
}))
vi.mock("@/lib/documents/storage-reconciliation", () => ({
	auditProviderDocumentStorage: mock.audit,
}))
vi.mock("@/lib/provider-document-storage", () => ({
	isR2DocumentStorageConfigured: mock.configured,
}))
import { GET } from "@/pages/api/cron/document-storage-reconciliation"
beforeEach(() => vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "true"))
afterEach(() => {
	vi.unstubAllEnvs()
	vi.clearAllMocks()
})
const request = (token = "test-cron") =>
	GET({
		request: new Request("http://localhost/api/cron/document-processing", {
			headers: { authorization: `Bearer ${token}` },
		}),
	} as Parameters<typeof GET>[0])
it("requires the cron secret before accessing storage", async () => {
	vi.stubEnv("CRON_SECRET", "test-cron")
	expect((await request("wrong")).status).toBe(401)
	expect(mock.audit).not.toHaveBeenCalled()
})
it("runs the read-only audit and exposes counts, never object identities", async () => {
	vi.stubEnv("CRON_SECRET", "test-cron")
	mock.worker.mockResolvedValue({ completed: 0 })
	mock.configured.mockReturnValue(true)
	mock.audit.mockResolvedValue({
		scanned: 1,
		entries: [{ objectKey: "private-key-not-for-response", state: "recent_unconfirmed" }],
	})
	const response = await request(),
		text = await response.text()
	expect(response.status).toBe(200)
	expect(JSON.parse(text)).toMatchObject({
		scanned: 1,
		recentUnconfirmed: 1,
		orphanCandidates: 0,
	})
	expect(text).not.toContain("private-key")
})
it("reports failure rather than a successful audit when reconciliation is unavailable", async () => {
	vi.stubEnv("CRON_SECRET", "test-cron")
	mock.worker.mockResolvedValue({ completed: 0 })
	mock.configured.mockReturnValue(true)
	mock.audit.mockRejectedValue(new Error("database unavailable"))
	expect((await request()).status).toBe(503)
})
it("does not scan storage when disabled, even with a valid cron secret", async () => {
	vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "false")
	vi.stubEnv("CRON_SECRET", "test-cron")
	expect((await request()).status).toBe(503)
	expect(mock.audit).not.toHaveBeenCalled()
})
