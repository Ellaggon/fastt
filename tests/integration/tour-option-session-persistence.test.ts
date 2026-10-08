import { afterEach, beforeEach, expect, it } from "vitest"
import {
	db,
	eq,
	ProviderOptionPreparationSession,
	Provider,
	Product,
	User,
	Variant,
	RatePlan,
	VariantCapacity,
	GeoPlace,
	ProductGeoPlace,
} from "@/shared/infrastructure/db/compat"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
	upsertTestUser,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import {
	startOptionSession,
	saveOptionSession,
	getOptionSession,
	listOptionSessions,
	finishOptionSession,
} from "@/lib/onboarding/tourOptionSession"
import { completeTourPreparationSessions } from "@/lib/onboarding/preparationSession"
import { optionWizardHref } from "@/lib/playbook/add-tour-option"
let provider: string,
	user: string,
	product: string,
	other: string,
	place: string,
	variants: string[],
	rates: string[]
beforeEach(async () => {
	provider = crypto.randomUUID()
	user = crypto.randomUUID()
	product = crypto.randomUUID()
	other = crypto.randomUUID()
	place = crypto.randomUUID()
	variants = [crypto.randomUUID(), crypto.randomUUID()]
	rates = [crypto.randomUUID(), crypto.randomUUID()]
	await upsertProvider({ id: provider, accountPurpose: "integration_certification" })
	await upsertTestUser({ id: user })
	await upsertGeoPlace({
		id: place,
		name: "Option session fixture",
		type: "city",
		country: "BO",
		slug: place,
	})
	for (const id of [product, other])
		await upsertProduct({
			id,
			name: "Option fixture",
			providerId: provider,
			geoPlaceId: place,
			productType: "tour",
			dataClass: "fixture",
		})
	for (let i = 0; i < 2; i++) {
		await upsertVariant({
			id: variants[i],
			productId: product,
			kind: "tour_slot",
			name: `Option ${i}`,
			maxOccupancy: 8,
		})
		await db
			.insert(RatePlan)
			.values({ id: rates[i], variantId: variants[i], name: "Draft rate", isActive: false })
	}
})
afterEach(async () => {
	await db
		.delete(ProviderOptionPreparationSession)
		.where(eq(ProviderOptionPreparationSession.providerId, provider))
	for (const id of variants) {
		await db.delete(RatePlan).where(eq(RatePlan.variantId, id))
		await db.delete(VariantCapacity).where(eq(VariantCapacity.variantId, id))
		await db.delete(Variant).where(eq(Variant.id, id))
	}
	for (const id of [product, other]) {
		await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, id))
		await db.delete(Product).where(eq(Product.id, id))
	}
	await db.delete(User).where(eq(User.id, user))
	await db.delete(Provider).where(eq(Provider.id, provider))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, place))
})
const revision = (row: { updatedAt: Date }) => new Date(row.updatedAt).getTime()
it("keeps simultaneous configurations independent, recovers a repeated start and does not close them when the tour preparation completes", async () => {
	const id = crypto.randomUUID(),
		second = crypto.randomUUID()
	const a = await startOptionSession(provider, user, product, id),
		b = await startOptionSession(provider, user, product, second)
	expect((await startOptionSession(provider, user, product, id)).id).toBe(a.id)
	const saved = await saveOptionSession(provider, user, {
		sessionId: id,
		revision: revision(a),
		lastPath: optionWizardHref(
			{ productId: product, sessionId: id, variantId: variants[0], ratePlanId: rates[0] },
			"conditions"
		),
	})
	expect(saved.variantId).toBe(variants[0])
	expect((await getOptionSession(provider, user, b.id)).variantId).toBeNull()
	await completeTourPreparationSessions(provider, product)
	expect(await listOptionSessions(provider, user, product)).toHaveLength(2)
	await finishOptionSession(provider, user, id, "abandoned")
	expect(await listOptionSessions(provider, user, product)).toHaveLength(1)
	expect((await db.select().from(RatePlan).where(eq(RatePlan.id, rates[0])))[0].isActive).toBe(
		false
	)
})
it("rejects foreign ownership, mixed product, mismatched rate, changed option and stale navigation without overwriting continuation", async () => {
	const a = await startOptionSession(provider, user, product, crypto.randomUUID())
	await expect(getOptionSession(crypto.randomUUID(), user, a.id)).rejects.toThrow(
		"session_not_found"
	)
	await expect(
		saveOptionSession(provider, user, {
			sessionId: a.id,
			revision: revision(a),
			lastPath: optionWizardHref(
				{ productId: other, sessionId: a.id, variantId: variants[0] },
				"price"
			),
		})
	).rejects.toThrow("product_mismatch")
	await expect(
		saveOptionSession(provider, user, {
			sessionId: a.id,
			revision: revision(a),
			lastPath: optionWizardHref(
				{ productId: product, sessionId: a.id, variantId: variants[0], ratePlanId: rates[1] },
				"conditions"
			),
		})
	).rejects.toThrow("rate_mismatch")
	const saved = await saveOptionSession(provider, user, {
		sessionId: a.id,
		revision: revision(a),
		lastPath: optionWizardHref(
			{ productId: product, sessionId: a.id, variantId: variants[0], ratePlanId: rates[0] },
			"conditions"
		),
	})
	await expect(
		saveOptionSession(provider, user, {
			sessionId: a.id,
			revision: revision(a),
			lastPath: saved.lastPath,
		})
	).rejects.toThrow("navigation_conflict")
	await expect(
		saveOptionSession(provider, user, {
			sessionId: a.id,
			revision: revision(saved),
			lastPath: optionWizardHref(
				{ productId: product, sessionId: a.id, variantId: variants[1], ratePlanId: rates[1] },
				"conditions"
			),
		})
	).rejects.toThrow("option_immutable")
	expect((await getOptionSession(provider, user, a.id)).lastPath).toBe(saved.lastPath)
	await expect(finishOptionSession(provider, user, a.id, "completed")).rejects.toThrow(
		"activation_required"
	)
})
it("returns corrections to review and rejects missing dependencies instead of saving an unusable route", async () => {
	const a = await startOptionSession(provider, user, product, crypto.randomUUID())
	await expect(
		saveOptionSession(provider, user, {
			sessionId: a.id,
			revision: revision(a),
			lastPath: optionWizardHref({ productId: product, sessionId: a.id }, "calendar"),
		})
	).rejects.toThrow("option_required")
	const href =
		optionWizardHref(
			{ productId: product, sessionId: a.id, variantId: variants[0], ratePlanId: rates[0] },
			"conditions"
		) + "&optionReturn=review"
	const saved = await saveOptionSession(provider, user, {
		sessionId: a.id,
		revision: revision(a),
		lastPath: href,
	})
	expect(saved.lastPath).toContain("optionReturn=review")
})

it("closes only a persisted activation, recovers a repeated completion and leaves another option open", async () => {
	const started = await startOptionSession(provider, user, product, crypto.randomUUID())
	const independent = await startOptionSession(provider, user, product, crypto.randomUUID())
	const session = await saveOptionSession(provider, user, {
		sessionId: started.id,
		revision: started.updatedAt.getTime(),
		lastPath: optionWizardHref({ productId: product, sessionId: started.id, variantId: variants[0], ratePlanId: rates[0] }, "review"),
	})
	await expect(finishOptionSession(provider, user, session.id, "completed")).rejects.toThrow("activation_required")
	await db.update(RatePlan).set({ isActive: true }).where(eq(RatePlan.id, rates[0]))
	await db.update(Variant).set({ salesEnabled: true }).where(eq(Variant.id, variants[0]))
	await finishOptionSession(provider, user, session.id, "completed")
	await finishOptionSession(provider, user, session.id, "completed")
	expect((await getOptionSession(provider, user, session.id)).status).toBe("completed")
	expect((await getOptionSession(provider, user, independent.id)).status).toBe("active")
	await expect(finishOptionSession(provider, user, session.id, "abandoned")).rejects.toThrow("session_not_active")
})
