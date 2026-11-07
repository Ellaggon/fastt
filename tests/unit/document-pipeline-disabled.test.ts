import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	session: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
}))
vi.mock("@/lib/auth/requireProvider", () => ({ requireProviderSessionSurface: mocks.session }))
vi.mock("@/shared/infrastructure/db/compat", async (original) => ({
	...(await original<typeof import("@/shared/infrastructure/db/compat")>()),
	db: { select: mocks.select, insert: mocks.insert, update: mocks.update },
}))
import { POST } from "@/pages/api/provider/settings/documents"
import { submitProviderDocument } from "@/lib/provider-documents"
import { runProviderDocumentProcessingWorker } from "@/lib/documents/document-processing"

afterEach(() => {
	vi.unstubAllEnvs()
	vi.clearAllMocks()
})

test.each(["multipart/form-data; boundary=fixture", "application/json"])(
	"disabled POST rejects %s before reading a payload or authenticating",
	async (contentType) => {
		vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "false")
		const request = new Request("https://fastt.test/api/provider/settings/documents", {
			method: "POST",
			headers: { "content-type": contentType, "origin": "https://fastt.test" },
			body: "deliberately-invalid",
		})
		const response = await POST({ request } as never)
		expect(response.status).toBe(503)
		expect(request.bodyUsed).toBe(false)
		expect(mocks.session).not.toHaveBeenCalled()
		expect(mocks.insert).not.toHaveBeenCalled()
	}
)

test("internal callers cannot bypass pause or enqueue a backlog", async () => {
	vi.stubEnv("FASTT_DOCUMENT_PIPELINE_ENABLED", "")
	await expect(submitProviderDocument({} as never)).rejects.toThrow("document_pipeline_disabled")
	await expect(runProviderDocumentProcessingWorker({ gatewayMode: "disabled" })).rejects.toThrow(
		"document_pipeline_disabled"
	)
	expect(mocks.select).not.toHaveBeenCalled()
	expect(mocks.insert).not.toHaveBeenCalled()
	expect(mocks.update).not.toHaveBeenCalled()
})
