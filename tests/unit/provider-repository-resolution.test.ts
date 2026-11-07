import { beforeEach, describe, expect, it, vi } from "vitest"

const query = vi.hoisted(() => {
	const execute = vi.fn()
	const chain: Record<string, any> = {}
	for (const method of ["from", "innerJoin", "where", "limit"]) chain[method] = vi.fn(() => chain)
	chain.then = (resolve: any, reject: any) => execute().then(resolve, reject)
	return { chain, execute, select: vi.fn(() => chain), predicate: vi.fn() }
})

vi.mock("@/shared/infrastructure/db/compat", () => ({
	first: (rows: unknown[]) => rows[0],
	and: query.predicate,
	eq: query.predicate,
	sql: query.predicate,
	db: { select: query.select },
	Provider: { id: "provider-id" },
	ProviderUser: { providerId: "link-provider", userId: "link-user" },
	User: { id: "user-id", email: "user-email" },
}))
vi.mock("@/lib/auth/authCache", () => ({ invalidateAuthContextForUser: vi.fn() }))

import { ProviderRepository } from "@/modules/catalog/infrastructure/repositories/ProviderRepository"

describe("provider resolution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		query.execute.mockResolvedValue([{ id: "provider" }])
	})

	for (const method of ["getProviderByUserId", "getProviderByUserEmail"] as const) {
		it(`${method} uses one query and preserves the provider result`, async () => {
			const result = await new ProviderRepository()[method]("user@example.test")
			expect(result).toEqual({ id: "provider" })
			expect(query.select).toHaveBeenCalledTimes(1)
			expect(query.execute).toHaveBeenCalledTimes(1)
			expect(query.chain.limit).toHaveBeenCalledWith(1)
		})

		it(`${method} returns null only for a missing link`, async () => {
			query.execute.mockResolvedValue([])
			await expect(new ProviderRepository()[method]("user@example.test")).resolves.toBeNull()
		})

		it(`${method} does not disguise a database failure as a missing provider`, async () => {
			const failure = Object.assign(new Error("database unavailable"), { code: "CONNECT_TIMEOUT" })
			query.execute.mockRejectedValue(failure)
			await expect(new ProviderRepository()[method]("user@example.test")).rejects.toBe(failure)
		})
	}
})
