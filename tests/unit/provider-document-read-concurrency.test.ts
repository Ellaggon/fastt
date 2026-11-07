import { expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ inspections: vi.fn(), scopes: vi.fn() }))
vi.mock("@/container", () => ({ providerRepository: {} }))
vi.mock("@/shared/infrastructure/db/compat", async (original) => {
	const actual = await original<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...actual,
		db: {
			select: () => ({
				from: (table: unknown) => ({
					where: () =>
						table === actual.ProviderDocument
							? {
									orderBy: () =>
										Promise.resolve([
											{
												id: "document",
												providerId: "provider",
												type: "business_registration",
												status: "verified",
											},
										]),
								}
							: mocks.inspections(),
					leftJoin: () => ({ where: mocks.scopes }),
				}),
			}),
		},
	}
})

import { listProviderDocuments } from "@/lib/provider-documents"

it("loads scopes while inspections are pending and preserves the combined evidence", async () => {
	let release!: (value: unknown[]) => void
	mocks.inspections.mockReturnValueOnce(
		new Promise((resolve) => {
			release = resolve
		})
	)
	mocks.scopes.mockResolvedValue([
		{ id: "scope", documentId: "document", scopeType: "product", productId: "tour" },
	])
	let completed = false
	const pending = listProviderDocuments("provider").then((rows) => {
		completed = true
		return rows
	})
	try {
		await vi.waitFor(() => expect(mocks.scopes).toHaveBeenCalledTimes(1))
		expect(completed).toBe(false)
	} finally {
		release([{ documentId: "document", processingState: "complete", malwareStatus: "clean" }])
	}
	const rows = await pending
	expect(rows[0].status).toBe("verified")
	expect(rows[0].scopes[0].productId).toBe("tour")
	expect(rows[0].technicalInspection?.malwareStatus).toBe("clean")
})
