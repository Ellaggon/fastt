import { afterAll, describe, expect, it } from "vitest"

import { ratePlanCommandRepository } from "@/container"
import {
	db,
	eq,
	Product,
	Provider,
	RatePlan,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"

const failureTrigger = "codex_tour_activation_failure_test"
const failureFunction = "codex_tour_activation_failure_test_fn"

async function seedTourActivationFixture() {
	const id = crypto.randomUUID().replaceAll("-", "")
	const fixture = {
		providerId: `tour-activation-provider-${id}`,
		productId: `tour-activation-product-${id}`,
		variantId: `tour-activation-variant-${id}`,
		ratePlanId: `tour-activation-rate-${id}`,
	}

	await db.insert(Provider).values({
		id: fixture.providerId,
		displayName: `Tour activation fixture ${id}`,
		accountPurpose: "integration_certification",
		dataClassification: "fixture",
	})
	try {
		await db.insert(Product).values({
			id: fixture.productId,
			providerId: fixture.providerId,
			name: `Tour activation fixture ${id}`,
			productType: "tour",
			dataClass: "fixture",
		})
		await db.insert(Variant).values({
			id: fixture.variantId,
			productId: fixture.productId,
			name: "Salida de prueba",
			kind: "tour_slot",
			lifecycleState: "ready",
			salesEnabled: false,
		})
		await ratePlanCommandRepository.createRatePlan({
			ratePlan: {
				id: fixture.ratePlanId,
				variantId: fixture.variantId,
				name: "Tarifa de prueba",
				description: null,
				isDefault: false,
				isActive: false,
				createdAt: new Date(),
			},
			restrictions: [],
		})
		return fixture
	} catch (error) {
		await db.delete(Variant).where(eq(Variant.id, fixture.variantId))
		await db.delete(Product).where(eq(Product.id, fixture.productId))
		await db.delete(Provider).where(eq(Provider.id, fixture.providerId))
		throw error
	}
}

async function cleanFixture(fixture: Awaited<ReturnType<typeof seedTourActivationFixture>>) {
	await ratePlanCommandRepository.deleteRatePlan(fixture.ratePlanId)
	await db.delete(Variant).where(eq(Variant.id, fixture.variantId))
	await db.delete(Product).where(eq(Product.id, fixture.productId))
	await db.delete(Provider).where(eq(Provider.id, fixture.providerId))
}

async function removeFailureTrigger() {
	await db.execute(sql.raw(`DROP TRIGGER IF EXISTS "${failureTrigger}" ON "RatePlan"`))
	await db.execute(sql.raw(`DROP FUNCTION IF EXISTS "${failureFunction}"()`))
}

describe("tour guided rate activation transaction in PostgreSQL", () => {
	afterAll(async () => {
		await removeFailureTrigger()
	})

	it("commits the rate and departure together and reports a retry as already active", async () => {
		const fixture = await seedTourActivationFixture()
		try {
			const result = await ratePlanCommandRepository.activateTourRate({
				...fixture,
				name: "Tarifa de prueba",
				description: null,
			})
			expect(result).toBe("activated")

			const [rate] = await db
				.select({ isActive: RatePlan.isActive, isDefault: RatePlan.isDefault })
				.from(RatePlan)
				.where(eq(RatePlan.id, fixture.ratePlanId))
			const [variant] = await db
				.select({ lifecycleState: Variant.lifecycleState, salesEnabled: Variant.salesEnabled })
				.from(Variant)
				.where(eq(Variant.id, fixture.variantId))
			expect(rate).toMatchObject({ isActive: true, isDefault: true })
			expect(variant).toMatchObject({ lifecycleState: "ready", salesEnabled: true })

			const retry = await ratePlanCommandRepository.activateTourRate({
				...fixture,
				name: "Tarifa de prueba",
				description: null,
			})
			expect(retry).toBe("already_active")
		} finally {
			await cleanFixture(fixture)
		}
	})

	it("rolls back the departure when the rate write fails", async () => {
		const fixture = await seedTourActivationFixture()
		try {
			await removeFailureTrigger()
			await db.execute(
				sql.raw(`
				CREATE FUNCTION "${failureFunction}"() RETURNS trigger
				LANGUAGE plpgsql AS $failure$
				BEGIN
					RAISE EXCEPTION 'forced tour activation failure';
				END;
				$failure$
			`)
			)
			await db.execute(
				sql.raw(`
				CREATE TRIGGER "${failureTrigger}"
				BEFORE UPDATE ON "RatePlan"
				FOR EACH ROW EXECUTE FUNCTION "${failureFunction}"()
			`)
			)

			await expect(
				ratePlanCommandRepository.activateTourRate({
					...fixture,
					name: "Tarifa de prueba",
					description: null,
				})
			).rejects.toThrow("forced tour activation failure")

			const [rate] = await db
				.select({ isActive: RatePlan.isActive, isDefault: RatePlan.isDefault })
				.from(RatePlan)
				.where(eq(RatePlan.id, fixture.ratePlanId))
			const [variant] = await db
				.select({ salesEnabled: Variant.salesEnabled })
				.from(Variant)
				.where(eq(Variant.id, fixture.variantId))
			expect(rate).toMatchObject({ isActive: false, isDefault: false })
			expect(variant).toMatchObject({ salesEnabled: false })

			await removeFailureTrigger()
			const retry = await ratePlanCommandRepository.activateTourRate({
				...fixture,
				name: "Tarifa de prueba",
				description: null,
			})
			expect(retry).toBe("activated")

			const [retriedRate] = await db
				.select({ isActive: RatePlan.isActive, isDefault: RatePlan.isDefault })
				.from(RatePlan)
				.where(eq(RatePlan.id, fixture.ratePlanId))
			const [retriedVariant] = await db
				.select({ lifecycleState: Variant.lifecycleState, salesEnabled: Variant.salesEnabled })
				.from(Variant)
				.where(eq(Variant.id, fixture.variantId))
			expect(retriedRate).toMatchObject({ isActive: true, isDefault: true })
			expect(retriedVariant).toMatchObject({ lifecycleState: "ready", salesEnabled: true })
		} finally {
			await removeFailureTrigger()
			await cleanFixture(fixture)
		}
	})
})
