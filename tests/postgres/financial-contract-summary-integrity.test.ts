import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { db, eq, Product, Provider } from "@/shared/infrastructure/db/compat"
const fixture = vi.hoisted(() => ({ provider: "", peer: "", diagnosis: vi.fn() }))
vi.mock("@/pages/api/internal/financial/_stage2", () => ({
	requireFinancialProvider: async () => ({
		ok: true,
		providerId: fixture.provider,
		user: { id: "test" },
	}),
}))
vi.mock("@/lib/dashboard/providerSidebarReadiness", () => ({
	getProviderSidebarData: async () => ({ productTypes: ["Tour", "Hotel"] }),
}))
vi.mock("@/lib/verification/commercial-lines", async (original) => ({
	...(await original<object>()),
	listProviderCommercialLines: async () => [
		{ line: "tour", collectionModel: "property_collect" },
		{ line: "lodging", collectionModel: "property_collect" },
	],
}))
vi.mock("@/lib/provider-holder-profile", () => ({
	readProviderHolderProfile: async () => ({
		holderType: "persona_natural",
		declarationStatus: "declared",
		holderCountry: "BO",
	}),
}))
vi.mock("@/lib/provider-documents", () => ({ listProviderDocuments: async () => [] }))
vi.mock("@/lib/commercial-policy/enforcement", () => ({
	resolveProductCommercialDiagnosis: fixture.diagnosis,
}))
import { GET } from "@/pages/api/internal/financial/contract-summary"
let a: string, b: string, foreign: string
beforeEach(async () => {
	fixture.provider = crypto.randomUUID()
	fixture.peer = crypto.randomUUID()
	a = crypto.randomUUID()
	b = crypto.randomUUID()
	foreign = crypto.randomUUID()
	await db.insert(Provider).values([
		{ id: fixture.provider, legalName: "Contract scoped fixture" },
		{ id: fixture.peer, legalName: "Peer fixture" },
	])
	await db.insert(Product).values([
		{ id: a, name: "A", productType: "tour", providerId: fixture.provider, dataClass: "fixture" },
		{
			id: b,
			name: "Hotel",
			productType: "hotel",
			providerId: fixture.provider,
			dataClass: "fixture",
		},
		{
			id: foreign,
			name: "Foreign",
			productType: "tour",
			providerId: fixture.peer,
			dataClass: "fixture",
		},
	])
	fixture.diagnosis
		.mockReset()
		.mockResolvedValue({
			diagnosis: {
				policyStatus: "supported",
				capabilities: {
					publish: true,
					booking: true,
					collect_payment: false,
					payout: false,
					integrations: true,
				},
				capabilityStates: {
					publish: "allowed",
					booking: "allowed",
					collect_payment: "not_applicable",
					payout: "not_applicable",
					integrations: "allowed",
				},
				blockers: [],
				satisfiedRequirements: [],
				policyVersionIds: ["v"],
			},
		})
})
afterEach(async () => {
	await db.delete(Product).where(eq(Product.providerId, fixture.provider))
	await db.delete(Product).where(eq(Product.providerId, fixture.peer))
	await db.delete(Provider).where(eq(Provider.id, fixture.provider))
	await db.delete(Provider).where(eq(Provider.id, fixture.peer))
})
async function get(query: string) {
	const url = new URL(`http://localhost/api/internal/financial/contract-summary?${query}`)
	return GET({ request: new Request(url), url } as never)
}
it("the real read route evaluates only the owned experience in scope, without changing any product", async () => {
	const before = await db.select().from(Product).where(eq(Product.providerId, fixture.provider))
	const response = await get("scope=tour")
	expect(response.status).toBe(200)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	const model = await response.json()
	expect(model.offerings.map((o: { productId: string }) => o.productId)).toEqual([a])
	expect(model.offerings[0].status).toBe("requirements_satisfied")
	expect(fixture.diagnosis).toHaveBeenCalledTimes(1)
	expect(await db.select().from(Product).where(eq(Product.providerId, fixture.provider))).toEqual(
		before
	)
	expect((await get(`scope=tour&productId=${foreign}`)).status).toBe(400)
	expect(fixture.diagnosis).toHaveBeenCalledTimes(1)
})
it("a diagnosis failure remains read_failed and is never presented as an unapproved contract", async () => {
	fixture.diagnosis.mockRejectedValueOnce(new Error("read unavailable"))
	const response = await get(`scope=tour&productId=${a}`)
	const model = await response.json()
	expect(model.offerings[0].status).toBe("read_failed")
	expect(model.offerings[0].primaryAction).toBeNull()
})
