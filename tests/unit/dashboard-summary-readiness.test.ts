import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
	products: vi.fn(),
	preparation: vi.fn(),
	user: vi.fn(),
	provider: vi.fn(),
}))
vi.mock("@/shared/infrastructure/db/compat", () => ({
	db: { select: () => ({ from: () => ({ where: mocks.products }) }) },
	Product: { id: "id", name: "name", providerId: "providerId", publicationState: "state" },
	eq: vi.fn(),
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({ getUserFromRequest: mocks.user }))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({ getProviderIdFromRequest: mocks.provider }))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	listProductOperationalPreparation: mocks.preparation,
}))
import { GET } from "@/pages/api/internal/dashboard-summary"
const request = new Request("http://fastt.local/api/internal/dashboard-summary")
const invoke = () => GET({ request } as Parameters<typeof GET>[0])
const summary = (prepared: boolean, readyToPublish: boolean) => ({
	statusLabel: "Listo para publicar",
	readyToPublish,
	completedChecks: prepared ? 10 : 9,
	totalChecks: 10,
	tourPresentation: {
		catalogStatus: { prepared, readyToPublish, label: prepared ? "Ficha preparada" : "Pendientes" },
	},
})
beforeEach(() => {
	vi.clearAllMocks()
	mocks.user.mockResolvedValue({ email: "provider@example.test" })
	mocks.provider.mockResolvedValue("provider")
})
describe("dashboard summary current readiness", () => {
	it("counts beyond five cards, excludes historical ready and separates preparation from publication permission", async () => {
		const products = Array.from({ length: 8 }, (_, i) => ({
			id: String(i),
			name: `Tour ${i}`,
			state: i === 2 ? "published" : "ready",
		}))
		mocks.products.mockResolvedValue(products)
		mocks.preparation.mockResolvedValue(
			new Map([
				["0", summary(false, false)], // incompatible conditions
				["1", summary(true, false)], // authorization pending
				["2", summary(true, true)], // published, never an unpublished ready counter
				["3", summary(false, false)],
				["4", summary(false, false)],
				["5", summary(true, true)], // outside visible cards
				["6", summary(true, true)],
				// no evaluation for 7 must not grant readiness
			])
		)
		const response = await invoke()
		expect(response.status).toBe(200)
		const body = await response.json()
		expect(mocks.preparation).toHaveBeenCalledWith(
			"provider",
			products.map((p) => p.id),
			{ request }
		)
		expect(body).toMatchObject({
			totalProducts: 8,
			publishedProducts: 1,
			preparedProducts: 4,
			readyProducts: 2,
			readyToPublishProducts: 2,
			inPreparationProducts: 5,
		})
		expect(body.products).toHaveLength(5)
		expect(body.products[0].statusLabel).toBe("Pendientes")
		expect(body.products[1].statusLabel).toBe("Ficha preparada")
		expect(body.products[2].statusLabel).toBe("Publicado")
	})
	it("preserves hotel evaluation and returns zero counters for an empty catalog", async () => {
		mocks.products.mockResolvedValue([{ id: "hotel", name: "Hotel", state: "draft" }])
		mocks.preparation.mockResolvedValue(
			new Map([["hotel", { readyToPublish: true, completedChecks: 4, totalChecks: 4 }]])
		)
		expect(await (await invoke()).json()).toMatchObject({
			preparedProducts: 1,
			readyToPublishProducts: 1,
		})
		mocks.products.mockResolvedValue([])
		mocks.preparation.mockResolvedValue(new Map())
		expect(await (await invoke()).json()).toMatchObject({
			totalProducts: 0,
			publishedProducts: 0,
			preparedProducts: 0,
			readyProducts: 0,
			inPreparationProducts: 0,
			products: [],
		})
	})
	it("does not manufacture counters when evaluation fails", async () => {
		mocks.products.mockResolvedValue([{ id: "tour", state: "ready" }])
		mocks.preparation.mockRejectedValue(new Error("evaluation failed"))
		await expect(invoke()).rejects.toThrow("evaluation failed")
	})
	it("rejects unauthenticated access before reading products", async () => {
		mocks.user.mockResolvedValue(null)
		expect((await invoke()).status).toBe(401)
		expect(mocks.products).not.toHaveBeenCalled()
	})
})
