import { afterEach, expect, test, vi } from "vitest"
const mocks = vi.hoisted(() => ({ session: vi.fn(), upload: vi.fn() }))
vi.mock("@/lib/auth/requireProvider", () => ({ requireProviderSessionSurface: mocks.session }))
vi.mock("@/lib/provider-document-storage", () => ({ createDirectDocumentUpload: mocks.upload }))
import { POST } from "@/pages/api/provider/settings/documents/upload"

afterEach(() => vi.resetAllMocks())
function request(origin = "https://fastt.test") {
	return new Request("https://fastt.test/api/provider/settings/documents/upload", {
		method: "POST",
		headers: { "Origin": origin, "Content-Type": "application/json" },
		body: JSON.stringify({ fileName: "synthetic.pdf" }),
	})
}
test("rejects foreign origins before authentication or signing", async () => {
	expect((await POST({ request: request("https://other.test") } as never)).status).toBe(403)
	expect(mocks.session).not.toHaveBeenCalled()
	expect(mocks.upload).not.toHaveBeenCalled()
})
test("requires document management permission", async () => {
	mocks.session.mockResolvedValue({
		provider: { providerId: "owner", permissions: { canManageDocuments: false } },
	})
	expect((await POST({ request: request() } as never)).status).toBe(403)
	expect(mocks.upload).not.toHaveBeenCalled()
})
test("derives provider from session, never from the request payload", async () => {
	mocks.session.mockResolvedValue({
		provider: { providerId: "owner", permissions: { canManageDocuments: true } },
	})
	mocks.upload.mockResolvedValue({ signedUrl: "https://storage.test" })
	const response = await POST({ request: request() } as never)
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("no-store")
	expect(mocks.upload.mock.calls[0][0]).toBe("owner")
})
