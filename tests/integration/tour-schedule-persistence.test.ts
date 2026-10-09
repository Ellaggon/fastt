import { TourDepartureInstance } from "@/shared/infrastructure/db/schema/tables"
import { expect, it } from "vitest"
import { db, eq, sql, DailyInventory, TourSlotProfile } from "@/shared/infrastructure/db/compat"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { previewTourDepartures, programTourDepartures } from "@/modules/inventory/public"

async function fixture() {
	const providerId = crypto.randomUUID(),
		productId = crypto.randomUUID(),
		variantId = crypto.randomUUID(),
		geoPlaceId = crypto.randomUUID()
	await upsertProvider({
		id: providerId,
		displayName: "Schedule test",
		ownerEmail: `${providerId}@example.test`,
	})
	await upsertGeoPlace({
		id: geoPlaceId,
		name: "La Paz",
		type: "city",
		country: "BO",
		slug: geoPlaceId,
	})
	await upsertProduct({
		id: productId,
		providerId,
		geoPlaceId,
		name: "Schedule tour",
		productType: "Tour",
	})
	await upsertVariant({ id: variantId, productId, kind: "tour_slot", name: "09:00" })
	await db.insert(TourSlotProfile).values({
		variantId,
		departureTime: "09:00",
		maxPax: 8,
		languageCode: "es",
		bookingMode: "shared",
	})
	const input = {
		variantId,
		from: "2099-01-01",
		to: "2099-01-04",
		weekdays: [0, 1, 2, 3, 4, 5, 6],
		excluded: [],
		capacity: 8,
	}
	return { providerId, input }
}
it("preserves complete existing rows, closed dates and cancellations; concurrent retries recover the same result", async () => {
	const { providerId, input } = await fixture()
	await db.insert(DailyInventory).values([
		{
			id: crypto.randomUUID(),
			variantId: input.variantId,
			date: "2099-01-01",
			totalInventory: 10,
			reservedCount: 3,
		},
		{
			id: crypto.randomUUID(),
			variantId: input.variantId,
			date: "2099-01-02",
			totalInventory: 0,
			reservedCount: 0,
		},
	])
	await db.insert(TourDepartureInstance).values({
		id: crypto.randomUUID(),
		providerId,
		variantId: input.variantId,
		date: "2099-01-03",
		isCancelled: true,
	})
	const before = await db
		.select()
		.from(DailyInventory)
		.where(eq(DailyInventory.variantId, input.variantId))
	const preview = await previewTourDepartures(providerId, input)
	expect(preview.newDates).toEqual(["2099-01-04"])
	expect(preview.blockedDates).toEqual(["2099-01-03"])
	const key = crypto.randomUUID()
	const results = await Promise.all([
		programTourDepartures(providerId, input, preview.token, key),
		programTourDepartures(providerId, input, preview.token, key),
	])
	expect(results[0].createdDates).toEqual(["2099-01-04"])
	expect(results[1].createdDates).toEqual(results[0].createdDates)
	const after = await db
		.select()
		.from(DailyInventory)
		.where(eq(DailyInventory.variantId, input.variantId))
	for (const row of before) expect(after.find((item) => item.id === row.id)).toEqual(row)
	expect(after).toHaveLength(3)
	await expect(
		programTourDepartures(providerId, { ...input, capacity: 9 }, preview.token, key)
	).rejects.toThrow("operación cambió")
})
it("rejects stale previews and foreign ownership without adding dates", async () => {
	const { providerId, input } = await fixture()
	const preview = await previewTourDepartures(providerId, input)
	await db
		.update(TourSlotProfile)
		.set({ departureTime: "10:00" })
		.where(eq(TourSlotProfile.variantId, input.variantId))
	await expect(
		programTourDepartures(providerId, input, preview.token, crypto.randomUUID())
	).rejects.toThrow("cambiaron")
	await expect(previewTourDepartures(crypto.randomUUID(), input)).rejects.toThrow("No encontramos")
	expect(
		await db.select().from(DailyInventory).where(eq(DailyInventory.variantId, input.variantId))
	).toHaveLength(0)
})

it("rolls back every new date if persistence fails during the batch", async () => {
	const { providerId, input } = await fixture()
	const preview = await previewTourDepartures(providerId, input)
	const name = `schedule_fail_${crypto.randomUUID().replaceAll("-", "")}`
	await db.execute(
		sql.raw(
			`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."variantId" = '${input.variantId}' AND NEW.date = '2099-01-04' THEN RAISE EXCEPTION 'controlled_schedule_failure'; END IF; RETURN NEW; END $$`
		)
	)
	await db.execute(
		sql.raw(
			`CREATE TRIGGER ${name} BEFORE INSERT ON "DailyInventory" FOR EACH ROW EXECUTE FUNCTION ${name}()`
		)
	)
	try {
		await expect(
			programTourDepartures(providerId, input, preview.token, crypto.randomUUID())
		).rejects.toThrow("controlled_schedule_failure")
		expect(
			await db.select().from(DailyInventory).where(eq(DailyInventory.variantId, input.variantId))
		).toHaveLength(0)
	} finally {
		await db.execute(sql.raw(`DROP TRIGGER ${name} ON "DailyInventory"`))
		await db.execute(sql.raw(`DROP FUNCTION ${name}()`))
	}
})

it("a failed availability refresh remains saved and an identical retry completes it", async () => {
	const { providerId, input } = await fixture()
	const preview = await previewTourDepartures(providerId, input)
	const name = `schedule_refresh_${crypto.randomUUID().replaceAll("-", "")}`
	await db.execute(
		sql.raw(
			`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."variantId" = '${input.variantId}' THEN RAISE EXCEPTION 'controlled_refresh_failure'; END IF; RETURN NEW; END $$`
		)
	)
	await db.execute(
		sql.raw(
			`CREATE TRIGGER ${name} BEFORE INSERT OR UPDATE ON "EffectiveAvailability" FOR EACH ROW EXECUTE FUNCTION ${name}()`
		)
	)
	const key = crypto.randomUUID()
	try {
		const saved = await programTourDepartures(providerId, input, preview.token, key)
		expect(saved.refresh).toBe("pending")
		expect(saved.createdDates).toHaveLength(4)
	} finally {
		await db.execute(sql.raw(`DROP TRIGGER ${name} ON "EffectiveAvailability"`))
		await db.execute(sql.raw(`DROP FUNCTION ${name}()`))
	}
	const recovered = await programTourDepartures(providerId, input, preview.token, key)
	expect(recovered.refresh).toBe("ready")
	expect(recovered.createdDates).toHaveLength(4)
	expect(
		await db.select().from(DailyInventory).where(eq(DailyInventory.variantId, input.variantId))
	).toHaveLength(4)
})
