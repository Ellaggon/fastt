import { expect, it, vi } from "vitest"
vi.mock("@/shared/infrastructure/db/client", () => ({
	withPostgresTransaction: (work: () => Promise<unknown>) => work(),
}))
import { registerDocumentWithRetry } from "@/lib/documents/registration-retry"

it("retries only errors which guarantee transaction rollback", async () => {
	const work = vi
		.fn()
		.mockRejectedValueOnce({ cause: { code: "40001" } })
		.mockRejectedValueOnce({ code: "40P01" })
		.mockResolvedValue("committed")
	expect(await registerDocumentWithRetry(work)).toBe("committed")
	expect(work).toHaveBeenCalledTimes(3)
})
it("does not blindly retry an ambiguous network failure", async () => {
	const work = vi.fn().mockRejectedValue({ code: "ECONNRESET" })
	await expect(registerDocumentWithRetry(work)).rejects.toMatchObject({ code: "ECONNRESET" })
	expect(work).toHaveBeenCalledTimes(1)
})
it("bounds retries", async () => {
	const work = vi.fn().mockRejectedValue({ code: "40001" })
	await expect(registerDocumentWithRetry(work)).rejects.toMatchObject({ code: "40001" })
	expect(work).toHaveBeenCalledTimes(3)
})
