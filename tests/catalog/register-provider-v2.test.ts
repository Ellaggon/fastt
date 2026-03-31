import { describe, it, expect, vi } from "vitest"
import { ZodError } from "zod"
import type { ProviderV2RepositoryPort } from "@/modules/catalog/public"
import { registerProviderV2 } from "@/modules/catalog/public"

function makeRepo(overrides?: Partial<ProviderV2RepositoryPort>): ProviderV2RepositoryPort {
	return {
		getProviderIdByUserEmail: vi.fn(async () => null),
		registerProvider: vi.fn(async () => ({ providerId: "prov_1", created: true })),
		upsertProfile: vi.fn(async () => {}),
		setVerificationStatus: vi.fn(async () => {}),
		...overrides,
	}
}

describe("catalog/provider-v2/registerProviderV2 (unit)", () => {
	it("fails without legalName", async () => {
		const repo = makeRepo()
		await expect(
			registerProviderV2(
				{ repo },
				{
					sessionEmail: "user@example.com",
					companyName: "QA Co",
					legalName: undefined,
					displayName: "QA Display",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("fails without displayName", async () => {
		const repo = makeRepo()
		await expect(
			registerProviderV2(
				{ repo },
				{
					sessionEmail: "user@example.com",
					companyName: "QA Co",
					legalName: "QA Legal",
					displayName: undefined,
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("calls repo.registerProvider and returns providerId/created when valid", async () => {
		const repo = makeRepo({
			registerProvider: vi.fn(async () => ({ providerId: "prov_abc", created: false })),
		})

		const res = await registerProviderV2(
			{ repo },
			{
				sessionEmail: "user@example.com",
				companyName: "QA Co",
				legalName: "QA Legal",
				displayName: "QA Display",
				contactEmail: "qa@test.com",
				phone: "+56912345678",
				type: "Hotel",
			}
		)

		expect(repo.registerProvider).toHaveBeenCalledTimes(1)
		expect(repo.registerProvider).toHaveBeenCalledWith({
			provider: {
				id: expect.any(String),
				userEmail: "user@example.com",
				companyName: "QA Co",
				legalName: "QA Legal",
				displayName: "QA Display",
				contactName: null,
				contactEmail: "qa@test.com",
				phone: "+56912345678",
				type: "Hotel",
				status: "draft",
			},
			userEmailForLink: "user@example.com",
			role: "owner",
		})
		expect(res).toEqual({ providerId: "prov_abc", created: false })
	})
})
