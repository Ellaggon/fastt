import { describe, it, expect, vi } from "vitest"
import { ZodError } from "zod"
import type { ProviderV2RepositoryPort } from "@/modules/catalog/public"
import { upsertProviderProfileV2 } from "@/modules/catalog/public"

function makeRepo(overrides?: Partial<ProviderV2RepositoryPort>): ProviderV2RepositoryPort {
	return {
		getProviderIdByUserEmail: vi.fn(async () => "prov_1"),
		registerProvider: vi.fn(async () => ({ providerId: "prov_1", created: true })),
		upsertProfile: vi.fn(async () => {}),
		setVerificationStatus: vi.fn(async () => {}),
		...overrides,
	}
}

describe("catalog/provider-v2/upsertProviderProfileV2 (unit)", () => {
	it("fails without timezone", async () => {
		const repo = makeRepo()
		await expect(
			upsertProviderProfileV2(
				{ repo },
				{
					sessionEmail: "user@example.com",
					timezone: "",
					defaultCurrency: "USD",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("fails without defaultCurrency", async () => {
		const repo = makeRepo()
		await expect(
			upsertProviderProfileV2(
				{ repo },
				{
					sessionEmail: "user@example.com",
					timezone: "UTC",
					defaultCurrency: "",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("fails with invalid supportEmail", async () => {
		const repo = makeRepo()
		await expect(
			upsertProviderProfileV2(
				{ repo },
				{
					sessionEmail: "user@example.com",
					timezone: "UTC",
					defaultCurrency: "USD",
					supportEmail: "not-an-email",
				}
			)
		).rejects.toBeInstanceOf(ZodError)
	})

	it("upserts profile when valid", async () => {
		const repo = makeRepo({
			getProviderIdByUserEmail: vi.fn(async () => "prov_abc"),
			upsertProfile: vi.fn(async () => {}),
		})

		const res = await upsertProviderProfileV2(
			{ repo },
			{
				sessionEmail: "user@example.com",
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
