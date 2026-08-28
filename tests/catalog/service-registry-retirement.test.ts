import { readFileSync } from "node:fs"

import { describe, expect, it, vi } from "vitest"

import { isServiceId, SERVICE_CODES, unknownServiceIds } from "@/data/service/service-registry"
import { syncProductServices } from "@/modules/catalog/public"

const read = (path: string) => readFileSync(path, "utf8")

describe("product service registry", () => {
	it("keeps stable service codes in the versioned registry", () => {
		expect(SERVICE_CODES.length).toBeGreaterThan(0)
		expect(isServiceId("wifi")).toBe(true)
		expect(isServiceId("not-a-service")).toBe(false)
		expect(unknownServiceIds(["wifi", "not-a-service", "not-a-service"])).toEqual([
			"not-a-service",
		])
	})

	it("rejects unknown codes before a product configuration is written", async () => {
		const ensureOwned = vi.fn().mockResolvedValue({ id: "product_1" })
		const sync = vi.fn()
		const response = await syncProductServices({
			ensureOwned,
			repo: { syncProductServices: sync } as any,
			providerId: "provider_1",
			productId: "product_1",
			services: [{ serviceId: "not-a-service" }],
		})

		expect(response.status).toBe(400)
		expect(sync).not.toHaveBeenCalled()
	})

	it("removes the redundant Service lookup from schema, baseline and repositories", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const baseline = read("db/postgres/0001_initial_schema.sql")
		const repository = read("src/modules/catalog/infrastructure/repositories/ProductServiceRepository.ts")
		const queryRepository = read(
			"src/modules/catalog/infrastructure/repositories/ProductServiceQueryRepository.ts"
		)
		const retirement = read("db/migrations/2026-09-29_retire_service_lookup_table.sql")

		expect(schema).not.toContain('pgTable("Service"')
		expect(schema).not.toContain('references(() => Service.id)')
		expect(baseline).not.toContain('CREATE TABLE "Service"')
		expect(baseline).not.toContain('"ProductService_serviceId_fk"')
		expect(repository).not.toContain(".from(Service)")
		expect(queryRepository).not.toContain(".leftJoin(Service")
		expect(retirement).toContain('DROP TABLE "Service"')
	})
})
