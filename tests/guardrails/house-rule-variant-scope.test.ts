import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function read(relativePath: string) {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("guardrails/house-rule variant scope", () => {
	it("locks schema, migration, and repository boundaries for product vs variant rules", () => {
		const migration = read("db/migrations/2026-09-24_house_rule_variant_scope.sql")
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		const integrity = read("src/shared/infrastructure/db/schema/postgres-integrity.sql")
		const repository = read(
			"src/modules/house-rules/infrastructure/repositories/HouseRuleRepository.ts"
		)
		const createRule = read("src/modules/house-rules/application/use-cases/create-house-rule.ts")
		const hold = read("src/modules/inventory/application/use-cases/create-inventory-hold.ts")

		expect(migration).toContain("\"scope\" text NOT NULL DEFAULT 'product'")
		expect(migration).toContain('"scopeId" text')
		expect(migration).toContain("CHECK (\"scope\" IN ('product', 'variant'))")
		expect(migration).toContain("HouseRule_variant_type_unique")
		expect(migration).toContain("HOUSE_RULE_VARIANT_SCOPE_MISMATCH")

		expect(tables).toContain('scope: text("scope").default("product").notNull()')
		expect(tables).toContain('scopeId: txtOpt("scopeId")')
		expect(tables).toContain("HouseRule_product_type_unique")
		expect(tables).toContain("HouseRule_variant_type_unique")
		expect(tables).toContain("IN ('product', 'variant')")

		expect(integrity).toContain("fastt_house_rule_variant_belongs_to_product")
		expect(integrity).toContain("trg_HouseRule_variant_product")

		expect(repository).toContain("listVariantOverrides")
		expect(repository).toContain('eq(HouseRuleTable.scope, "product")')
		expect(repository).toContain('eq(HouseRuleTable.scope, "variant")')
		expect(repository).toContain("hotelRoomBelongsToProduct")

		expect(createRule).toContain("isVariantOverrideHouseRuleType")
		expect(createRule).toContain("validation_error:type_not_overridable")
		expect(createRule).toContain("findByIdentity")

		expect(hold).toContain(
			"buildGuestExpectationsSnapshot(deps.policyContext.productId, parsed.variantId)"
		)
	})

	it("keeps commercial policies out of house-rule variant scope", () => {
		const domain = read("src/modules/house-rules/domain/houseRule.ts")
		const publicApi = read("src/modules/house-rules/public.ts")
		const snapshot = read("src/modules/house-rules/domain/guestStayExpectationsSnapshot.ts")

		expect(domain).not.toContain("Cancellation")
		expect(domain).not.toContain("Payment")
		expect(domain).not.toContain("NoShow")
		expect(publicApi).toContain("listEffectiveHouseRules")
		expect(publicApi).toContain("buildGuestStayExpectationsSnapshot")
		expect(snapshot).toContain("EffectiveHouseRuleSource")
		expect(snapshot).toContain("house_rule_snapshot:v2:")
	})

	it("keeps pets and smoking out of the services catalog", () => {
		const catalog = read("src/data/service/service-catalog.ts")
		const attributes = read("src/data/service/service-attributes.ts")
		const domain = read("src/modules/house-rules/domain/houseRule.ts")
		const cleanup = read("db/migrations/2026-09-26_retire_house_rule_service_aliases.sql")

		for (const retiredService of ["pet-friendly", "smoking-rooms", "nonsmoking"]) {
			expect(catalog).not.toContain(`id: "${retiredService}"`)
			expect(attributes).not.toContain(`"${retiredService}":`)
		}
		expect(domain).toContain('"Pets"')
		expect(domain).toContain('"Smoking"')
		expect(cleanup).toContain('DELETE FROM "ProductService"')
	})
})
