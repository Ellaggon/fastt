import { describe, it, expect, vi } from "vitest"
import type { ProviderV2RepositoryPort } from "@/modules/catalog/public"
import { upsertProviderProfileV2 } from "@/modules/catalog/public"
import { ValidationError } from "@/lib/validation/ValidationError"

function makeRepo(overrides?: Partial<ProviderV2RepositoryPort>): ProviderV2RepositoryPort {
	return {
		registerProvider: vi.fn(async () => ({ providerId: "prov_1", created: true })),
		upsertProfile: vi.fn(async () => {}),
		setVerificationStatus: vi.fn(async () => {}),
		...overrides,
	}
}

describe("catalog/provider-v2/upsertProviderProfileV2 (unit)", () => {
	it("fails without timezone", async () => {
		const repo = makeRepo()
		const promise = upsertProviderProfileV2(
			{ repo },
			{
				providerId: "prov_1",
				timezone: "",
				defaultCurrency: "USD",
			}
		)
		await expect(promise).rejects.toBeInstanceOf(ValidationError)
		await expect(promise).rejects.toMatchObject({ errors: { timezone: expect.any(String) } })
	})

	it("fails without defaultCurrency", async () => {
		const repo = makeRepo()
		const promise = upsertProviderProfileV2(
			{ repo },
			{
				providerId: "prov_1",
				timezone: "UTC",
				defaultCurrency: "",
			}
		)
		await expect(promise).rejects.toBeInstanceOf(ValidationError)
		await expect(promise).rejects.toMatchObject({ errors: { defaultCurrency: expect.any(String) } })
	})

	it("fails with invalid supportEmail", async () => {
		const repo = makeRepo()
		const promise = upsertProviderProfileV2(
			{ repo },
			{
				providerId: "prov_1",
				timezone: "UTC",
				defaultCurrency: "USD",
				supportEmail: "not-an-email",
			}
		)
		await expect(promise).rejects.toBeInstanceOf(ValidationError)
		await expect(promise).rejects.toMatchObject({ errors: { supportEmail: expect.any(String) } })
	})

	it("upserts profile when valid", async () => {
		const repo = makeRepo({
			upsertProfile: vi.fn(async () => {}),
		})

		const res = await upsertProviderProfileV2(
			{ repo },
			{
				providerId: "prov_abc",
				timezone: "America/Santiago",
				defaultCurrency: "USD",
				supportEmail: "support@test.com",
				supportPhone: "+56912345678",
			}
		)

		expect(repo.upsertProfile).toHaveBeenCalledTimes(1)
		expect(repo.upsertProfile).toHaveBeenCalledWith({
			providerId: "prov_abc",
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "support@test.com",
			supportPhone: "+56912345678",
		})
		expect(res).toEqual({ providerId: "prov_abc" })
	})
})
