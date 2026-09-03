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

describePostgres("Typed assignment relational integrity", () => {
	let sql: postgres.Sql

	async function rollbackTransaction(run: (tx: postgres.TransactionSql) => Promise<void>) {
		const rollback = new Error(`rollback-${randomUUID()}`)
		try {
			await sql.begin(async (tx) => {
				await run(tx)
				throw rollback
			})
		} catch (error) {
			if (error !== rollback) throw error
		}
	}

	async function expectDatabaseError(
		tx: postgres.TransactionSql,
		run: (savepoint: postgres.TransactionSql) => Promise<unknown>,
		pattern: RegExp
	) {
		let captured: unknown
		try {
			await tx.savepoint(async (savepoint) => run(savepoint))
		} catch (error) {
			captured = error
		}
		expect(captured).toBeTruthy()
		expect(captured instanceof Error ? captured.message : String(captured)).toMatch(pattern)
	}

	beforeAll(() => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
	})

	afterAll(async () => {
		if (sql) await sql.end()
	})

	it("types policy exceptions and rejects cross-provider assignments and lineage", async () => {
		await rollbackTransaction(async (tx) => {
			const suffix = randomUUID()
			const providerA = `provider-a-${suffix}`
			const providerB = `provider-b-${suffix}`
			const productA = `product-a-${suffix}`
			const productB = `product-b-${suffix}`
			const variantA = `variant-a-${suffix}`
			const variantB = `variant-b-${suffix}`
			const rateA = `rate-a-${suffix}`
			const rateB = `rate-b-${suffix}`
			const definitionA = `definition-a-${suffix}`
			const groupA = `group-a-${suffix}`
			const ruleSetA = `rule-set-a-${suffix}`
			const ruleA = `rule-a-${suffix}`

			await tx`insert into "Provider" ("id") values (${providerA}), (${providerB})`
			await tx`
				insert into "Product" ("id", "name", "productType", "providerId", "dataClass")
				values (${productA}, 'Product A', 'hotel', ${providerA}, 'fixture'),
					(${productB}, 'Product B', 'hotel', ${providerB}, 'fixture')
			`
			await tx`
				insert into "Variant" ("id", "productId", "name", "kind")
				values (${variantA}, ${productA}, 'Variant A', 'hotel_room'),
					(${variantB}, ${productB}, 'Variant B', 'hotel_room')
			`
			await tx`
				insert into "RatePlan" ("id", "variantId", "name")
				values (${rateA}, ${variantA}, 'Rate A'), (${rateB}, ${variantB}, 'Rate B')
			`

			const exceptionId = `exception-${suffix}`
			await tx`
				insert into "PolicyExceptionRule" (
					"id", "type", "scope", "productTargetId", "actionJson"
				) values (
					${exceptionId}, 'support_manual_override', 'product', ${productA}, '{}'::jsonb
				)
			`
			const [exception] = await tx`
				select "scopeId", "productTargetId", "variantTargetId", "ratePlanTargetId"
				from "PolicyExceptionRule" where "id" = ${exceptionId}
			`
			expect(exception).toMatchObject({
				scopeId: productA,
				productTargetId: productA,
				variantTargetId: null,
				ratePlanTargetId: null,
			})

			await expectDatabaseError(tx, (savepoint) =>
				savepoint`
					insert into "PolicyExceptionRule" (
						"id", "type", "scope", "variantTargetId", "actionJson"
					) values (
						${`invalid-exception-${suffix}`}, 'support_manual_override', 'product', ${variantA}, '{}'::jsonb
					)
				`, /PolicyExceptionRule_typed_target_check/)

			await tx`
				insert into "TaxFeeDefinition" (
					"id", "providerId", "code", "name", "kind", "calculationType", "value",
					"inclusionType", "appliesPer", "status", "editingState"
				) values (
					${definitionA}, ${providerA}, ${definitionA}, 'Tax A', 'tax', 'percentage', 10,
					'excluded', 'stay', 'archived', 'draft'
				)
			`
			await expectDatabaseError(tx, (savepoint) =>
				savepoint`
					insert into "TaxFeeAssignment" (
						"id", "taxFeeDefinitionId", "scope", "productTargetId"
					) values (${`tax-assignment-${suffix}`}, ${definitionA}, 'product', ${productB})
				`, /TAX_FEE_ASSIGNMENT_PROVIDER_MISMATCH/)

			await tx`
				insert into "PolicyGroup" ("id", "category", "ownerProviderId")
				values (${groupA}, 'Cancellation', ${providerA})
			`
			await expectDatabaseError(tx, (savepoint) =>
				savepoint`
					insert into "PolicyAssignment" (
						"id", "policyGroupId", "category", "scope", "productTargetId"
					) values (${`policy-assignment-${suffix}`}, ${groupA}, 'Cancellation', 'product', ${productB})
				`, /POLICY_ASSIGNMENT_PROVIDER_MISMATCH/)

			await tx`
				insert into "CommercialRuleSet" ("id", "providerId", "name")
				values (${ruleSetA}, ${providerA}, 'Rule set A')
			`
			await tx`
				insert into "CommercialRule" (
					"id", "providerId", "ruleSetId", "category", "type"
				) values (${ruleA}, ${providerA}, ${ruleSetA}, 'pricing', 'fixed_adjustment')
			`
			await expectDatabaseError(tx, (savepoint) =>
				savepoint`
					insert into "CommercialRuleApplication" (
						"id", "providerId", "ruleSetId", "ruleId", "scope", "ratePlanTargetId"
					) values (
						${`application-${suffix}`}, ${providerA}, ${ruleSetA}, ${ruleA}, 'rate_plan', ${rateB}
					)
				`, /COMMERCIAL_RULE_APPLICATION_PROVIDER_MISMATCH/)
		})
	})

	it("keeps ownership identities stable after aggregate creation", async () => {
		await rollbackTransaction(async (tx) => {
			const suffix = randomUUID()
			const providerA = `provider-a-${suffix}`
			const providerB = `provider-b-${suffix}`
			const productA = `product-a-${suffix}`
			const productB = `product-b-${suffix}`
			const variantA = `variant-a-${suffix}`
			const variantB = `variant-b-${suffix}`
			const rateA = `rate-a-${suffix}`
			const definitionA = `definition-a-${suffix}`
			const groupA = `group-a-${suffix}`

			await tx`insert into "Provider" ("id") values (${providerA}), (${providerB})`
			await tx`
				insert into "Product" ("id", "name", "productType", "providerId", "dataClass")
				values (${productA}, 'Product A', 'hotel', ${providerA}, 'fixture'),
					(${productB}, 'Product B', 'hotel', ${providerB}, 'fixture')
			`
			await tx`
				insert into "Variant" ("id", "productId", "name", "kind")
				values (${variantA}, ${productA}, 'Variant A', 'hotel_room'),
					(${variantB}, ${productB}, 'Variant B', 'hotel_room')
			`
			await tx`insert into "RatePlan" ("id", "variantId", "name") values (${rateA}, ${variantA}, 'Rate A')`

			await expectDatabaseError(
				tx,
				(savepoint) => savepoint`update "Product" set "providerId" = ${providerB} where "id" = ${productA}`,
				/PRODUCT_PROVIDER_IDENTITY_IMMUTABLE/
			)
			await expectDatabaseError(
				tx,
				(savepoint) => savepoint`update "Variant" set "productId" = ${productB} where "id" = ${variantA}`,
				/VARIANT_CROSS_PROVIDER_MOVE_BLOCKED/
			)
			await expectDatabaseError(
				tx,
				(savepoint) => savepoint`update "RatePlan" set "variantId" = ${variantB} where "id" = ${rateA}`,
				/RATE_PLAN_CROSS_PROVIDER_MOVE_BLOCKED/
			)

			await tx`
				insert into "TaxFeeDefinition" (
					"id", "providerId", "code", "name", "kind", "calculationType", "value",
					"inclusionType", "appliesPer", "status", "editingState"
				) values (
					${definitionA}, ${providerA}, ${definitionA}, 'Tax A', 'tax', 'percentage', 10,
					'excluded', 'stay', 'archived', 'draft'
				)
			`
			await expectDatabaseError(
				tx,
				(savepoint) => savepoint`update "TaxFeeDefinition" set "providerId" = ${providerB} where "id" = ${definitionA}`,
				/TAX_FEE_DEFINITION_PROVIDER_IDENTITY_IMMUTABLE/
			)

			await tx`
				insert into "PolicyGroup" ("id", "category", "ownerProviderId")
				values (${groupA}, 'Cancellation', ${providerA})
			`
			await expectDatabaseError(
				tx,
				(savepoint) => savepoint`update "PolicyGroup" set "ownerProviderId" = ${providerB} where "id" = ${groupA}`,
				/POLICY_GROUP_PROVIDER_IDENTITY_IMMUTABLE/
			)
		})
	})
})
