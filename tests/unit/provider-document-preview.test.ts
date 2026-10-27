import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	permission: true,
	row: { id: "doc", fileUrl: "r2:provider-documents/owner/doc/file.pdf" } as {
		id: string
		fileUrl: string
	} | null,
	where: vi.fn(),
	safe: vi.fn(),
	sign: vi.fn(),
	audit: vi.fn(),
	session: vi.fn(),
}))
vi.mock("@/lib/auth/requireProvider", () => ({ requireProviderSessionSurface: mocks.session }))
vi.mock("@/lib/audit/audit-events", () => ({ writeSensitiveDataAccessEvent: mocks.audit }))
vi.mock("@/lib/documents/document-processing", () => ({
	assertProviderDocumentSafeToReveal: mocks.safe,
}))
vi.mock("@/lib/provider-document-storage", () => ({ createProviderDocumentPreviewUrl: mocks.sign }))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	ProviderDocument: { id: "id", providerId: "providerId", fileUrl: "fileUrl" },
	eq: (column: string, value: string) => [column, value],
	and: (...conditions: unknown[]) => conditions,
	first: (rows: unknown[]) => rows[0],
	db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}))
import { GET } from "@/pages/api/provider/settings/documents/preview"

beforeEach(() => {
	vi.clearAllMocks()
	mocks.row = { id: "doc", fileUrl: "r2:provider-documents/owner/doc/file.pdf" }
	mocks.session.mockResolvedValue({
		user: { id: "user" },
		provider: { providerId: "owner", permissions: { canManageDocuments: true } },
	})
	mocks.where.mockImplementation(async () => (mocks.row ? [mocks.row] : []))
	mocks.safe.mockResolvedValue(undefined)
	mocks.sign.mockResolvedValue("https://storage.test/signed")
})
const invoke = () =>
	GET({
		request: new Request(
			"https://fastt.test/api/provider/settings/documents/preview?documentId=doc"
		),
	} as Parameters<typeof GET>[0])

it("scopes the query to the signed-in provider, checks the artifact and audits before redirecting", async () => {
	const response = await invoke()
	expect(mocks.where).toHaveBeenCalledWith([
		["id", "doc"],
		["providerId", "owner"],
	])
	expect(mocks.safe).toHaveBeenCalledWith("doc")
	expect(mocks.audit).toHaveBeenCalledWith(
		expect.objectContaining({ actorUserId: "user", providerId: "owner", resourceId: "doc" })
	)
	expect(response.status).toBe(303)
	expect(response.headers.get("Location")).toBe("https://storage.test/signed")
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
})
it("denies read-only roles before querying or signing", async () => {
	mocks.session.mockResolvedValue({ provider: { permissions: { canManageDocuments: false } } })
	expect((await invoke()).status).toBe(403)
	expect(mocks.where).not.toHaveBeenCalled()
	expect(mocks.sign).not.toHaveBeenCalled()
})
it("does not reveal another provider's or a missing document", async () => {
	mocks.row = null
	expect((await invoke()).status).toBe(404)
	expect(mocks.sign).not.toHaveBeenCalled()
})
it("never signs or reveals a document that fails processing safety checks", async () => {
	mocks.safe.mockRejectedValue(new Error("infected"))
	expect((await invoke()).status).toBe(503)
	expect(mocks.sign).not.toHaveBeenCalled()
})
it("does not redirect if the audit cannot be recorded", async () => {
	mocks.audit.mockRejectedValueOnce(new Error("unavailable"))
	expect((await invoke()).status).toBe(503)
})
