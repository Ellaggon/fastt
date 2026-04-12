import { describe, it, expect, vi } from "vitest"
import type { ProviderV2RepositoryPort } from "@/modules/catalog/public"
import { registerProviderV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function makeRepo(overrides?: Partial<ProviderV2RepositoryPort>): ProviderV2RepositoryPort {
	return {
		registerProvider: vi.fn(async () => ({ providerId: "prov_1", created: true })),
		upsertProfile: vi.fn(async () => {}),
		setVerificationStatus: vi.fn(async () => {}),
		...overrides,
	}
}

describe("catalog/provider-v2/registerProviderV2 (unit)", () => {
	it("fails without legalName", async () => {
		const repo = makeRepo()
		const promise = registerProviderV2(
			{ repo },
			{
				sessionEmail: "user@example.com",
				legalName: undefined,
				displayName: "QA Display",
			}
		)
		await expect(promise).rejects.toBeInstanceOf(ValidationError)
		await expect(promise).rejects.toMatchObject({ errors: { legalName: expect.any(String) } })
	})

	it("fails without displayName", async () => {
		const repo = makeRepo()
		const promise = registerProviderV2(
			{ repo },
			{
				sessionEmail: "user@example.com",
				legalName: "QA Legal",
				displayName: undefined,
			}
		)
		await expect(promise).rejects.toBeInstanceOf(ValidationError)
		await expect(promise).rejects.toMatchObject({ errors: { displayName: expect.any(String) } })
	})

	it("calls repo.registerProvider and returns providerId/created when valid", async () => {
		const repo = makeRepo({
			registerProvider: vi.fn(async () => ({ providerId: "prov_abc", created: false })),
		})

		const res = await registerProviderV2(
			{ repo },
			{
				sessionEmail: "user@example.com",
				legalName: "QA Legal",
				displayName: "QA Display",
			}
		)

		expect(repo.registerProvider).toHaveBeenCalledTimes(1)
		expect(repo.registerProvider).toHaveBeenCalledWith({
			provider: {
				id: expect.any(String),
				legalName: "QA Legal",
				displayName: "QA Display",
				status: "draft",
			},
			userEmailForLink: "user@example.com",
			role: "owner",
		})
		expect(res).toEqual({ providerId: "prov_abc", created: false })
	})
})
