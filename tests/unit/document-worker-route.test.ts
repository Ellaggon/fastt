import { afterEach, expect, test, vi } from "vitest"
const worker = vi.hoisted(() => vi.fn())
vi.mock("@/lib/documents/document-processing", () => ({
	runProviderDocumentProcessingWorker: worker,
}))
import { GET } from "@/pages/api/cron/document-processing"
afterEach(() => {
	vi.unstubAllEnvs()
	vi.resetAllMocks()
})
test("dedicated worker token processes one bounded job, without bucket scans", async () => {
	vi.stubEnv("CRON_SECRET", "")
	vi.stubEnv("DOCUMENT_PROCESSING_WORKER_TOKEN", "a".repeat(32))
	worker.mockResolvedValue({ claimed: 0 })
	const response = await GET({
		request: new Request("https://fastt.test/api/cron/document-processing", {
			headers: { Authorization: `Bearer ${"a".repeat(32)}` },
		}),
	} as never)
	expect(response.status).toBe(200)
	expect(worker).toHaveBeenCalledWith({ limit: 1, maxElapsedMs: 45_000 })
})
test("does not expose worker to anonymous requests", async () => {
	vi.stubEnv("CRON_SECRET", "cron-token")
	vi.stubEnv("DOCUMENT_PROCESSING_WORKER_TOKEN", "")
	expect(
		(
			await GET({
				request: new Request("https://fastt.test/api/cron/document-processing"),
			} as never)
		).status
	).toBe(401)
	expect(worker).not.toHaveBeenCalled()
})
