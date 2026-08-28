import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated =
	process.env.FASTT_DATA_ENV === "test"
		? prepareIsolatedTestDatabase()
		: { configured: false as const }
const connectionUrl = isolated.configured ? (isolated.directUrl ?? isolated.runtimeUrl) : ""
const describePostgres = connectionUrl ? describe : describe.skip
const prefix = `typed-assignment-${randomUUID()}`

const ids = {
	provider: `${prefix}-provider`,
	product: `${prefix}-product`,
	variant: `${prefix}-variant`,
	ratePlan: `${prefix}-rate-plan`,
	taxDefinition: `${prefix}-tax-definition`,
	policyGroup: `${prefix}-policy-group`,
	ruleSet: `${prefix}-rule-set`,
	rule: `${prefix}-rule`,
}

describePostgres("typed commercial assignment targets", () => {
	let sql: postgres.Sql

	async function cleanup() {
		await sql`delete from "TaxFeeAssignment" where "id" like ${`${prefix}%`}`
		await sql`delete from "PolicyAssignment" where "id" like ${`${prefix}%`}`
		await sql`delete from "CommercialRuleApplication" where "id" like ${`${prefix}%`}`
		await sql`delete from "CommercialRule" where "id" = ${ids.rule}`
		await sql`delete from "CommercialRuleSet" where "id" = ${ids.ruleSet}`
		await sql`delete from "PolicyGroup" where "id" = ${ids.policyGroup}`
		await sql`delete from "TaxFeeDefinition" where "id" = ${ids.taxDefinition}`
		await sql`delete from "RatePlan" where "id" = ${ids.ratePlan}`
		await sql`delete from "Variant" where "id" = ${ids.variant}`
		await sql`delete from "Product" where "id" = ${ids.product}`
		await sql`delete from "Provider" where "id" = ${ids.provider}`
	}

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
		await cleanup()
		await sql`insert into "Provider" ("id", "accountPurpose", "dataClassification") values (${ids.provider}, 'internal_qa', 'fixture')`
		await sql`insert into "Product" ("id", "name", "productType", "providerId", "dataClass", "publicationState") values (${ids.product}, 'Typed target product', 'hotel', ${ids.provider}, 'fixture', 'draft')`
		await sql`insert into "Variant" ("id", "productId", "name", "kind") values (${ids.variant}, ${ids.product}, 'Typed target unit', 'hotel_room')`
		await sql`insert into "RatePlan" ("id", "variantId", "name") values (${ids.ratePlan}, ${ids.variant}, 'Typed target rate')`
		await sql`insert into "TaxFeeDefinition" ("id", "providerId", "code", "name", "kind", "calculationType", "value", "inclusionType", "appliesPer", "priority", "status", "editingState") values (${ids.taxDefinition}, ${ids.provider}, 'TYPED_TARGET', 'Typed target tax', 'tax', 'percentage', 10, 'excluded', 'stay', 0, 'active', 'draft')`
		await sql`insert into "PolicyGroup" ("id", "category", "ownerProviderId") values (${ids.policyGroup}, 'Cancellation', ${ids.provider})`
		await sql`insert into "CommercialRuleSet" ("id", "providerId", "name") values (${ids.ruleSet}, ${ids.provider}, 'Typed target rules')`
		await sql`insert into "CommercialRule" ("id", "providerId", "ruleSetId", "category", "type") values (${ids.rule}, ${ids.provider}, ${ids.ruleSet}, 'sellability', 'stop_sell')`
	})

	afterAll(async () => {
		if (sql) {
			await cleanup()
			await sql.end()
		}
	})

	it("derives scopeId from exactly one typed target in all commercial assignment tables", async () => {
		const taxAssignment = `${prefix}-tax-assignment`
		const policyAssignment = `${prefix}-policy-assignment`
		const commercialAssignment = `${prefix}-commercial-assignment`

		await sql`insert into "TaxFeeAssignment" ("id", "taxFeeDefinitionId", "scope", "providerTargetId") values (${taxAssignment}, ${ids.taxDefinition}, 'provider', ${ids.provider})`
		await sql`insert into "PolicyAssignment" ("id", "policyGroupId", "category", "scope", "productTargetId") values (${policyAssignment}, ${ids.policyGroup}, 'Cancellation', 'product', ${ids.product})`
		await sql`insert into "CommercialRuleApplication" ("id", "providerId", "ruleSetId", "ruleId", "scope", "ratePlanTargetId") values (${commercialAssignment}, ${ids.provider}, ${ids.ruleSet}, ${ids.rule}, 'rate_plan', ${ids.ratePlan})`

		const [tax, policy, commercial] = await Promise.all([
			sql`select "scopeId" from "TaxFeeAssignment" where "id" = ${taxAssignment}`,
			sql`select "scopeId" from "PolicyAssignment" where "id" = ${policyAssignment}`,
			sql`select "scopeId" from "CommercialRuleApplication" where "id" = ${commercialAssignment}`,
		])

		expect(tax).toEqual([{ scopeId: ids.provider }])
		expect(policy).toEqual([{ scopeId: ids.product }])
		expect(commercial).toEqual([{ scopeId: ids.ratePlan }])
	})

	it("rejects a mismatched scope and an unknown typed target", async () => {
		await expect(
			sql`insert into "TaxFeeAssignment" ("id", "taxFeeDefinitionId", "scope", "providerTargetId") values (${`${prefix}-bad-shape`}, ${ids.taxDefinition}, 'product', ${ids.provider})`
		).rejects.toThrow(/TaxFeeAssignment_typed_target_check/)

		await expect(
			sql`insert into "PolicyAssignment" ("id", "policyGroupId", "category", "scope", "productTargetId") values (${`${prefix}-missing-target`}, ${ids.policyGroup}, 'Cancellation', 'product', 'missing-product')`
		).rejects.toThrow(/PolicyAssignment_productTargetId_fk/)
	})
})
