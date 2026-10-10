import { readFile } from "node:fs/promises"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import {
	db,
	eq,
	inArray,
	sql,
	User,
	Provider,
	Product,
	Tour,
	Variant,
	RatePlan,
	DailyInventory,
	Booking,
	ProviderAuditLog,
	ProviderDocument,
	ProviderDocumentScope,
} from "@/shared/infrastructure/db/compat"
import { ExperienceFormatRepository } from "@/modules/catalog/infrastructure/repositories/ExperienceFormatRepository"
import { CatalogReadModelRepository } from "@/modules/catalog/infrastructure/repositories/CatalogReadModelRepository"

const ids = Array.from({ length: 8 }, () => crypto.randomUUID())
const [
	providerId,
	userId,
	productId,
	otherProductId,
	variantId,
	ratePlanId,
	bookingId,
	documentId,
] = ids
let session: {
	providerId: string
	userId: string
	permissions: { canEditProfile: boolean }
} | null = null
vi.mock("@/lib/auth/providerSessionSurface", () => ({
	getProviderSessionSurfaceFromRequest: async () => session,
}))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidateProduct: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: vi.fn().mockResolvedValue(undefined),
}))
const { POST } = await import("@/pages/api/product/experience-format")
const repo = new ExperienceFormatRepository()
const declaration = {
	providerId,
	actorUserId: userId,
	productId,
	experienceFormat: "workshop" as const,
}

beforeAll(async () => {
	await db.insert(User).values({ id: userId, email: `${userId}@experience.test` })
	await db.insert(Provider).values({
		id: providerId,
		accountPurpose: "commercial",
		dataClassification: "production",
	})
	await db.insert(Product).values([
		{
			id: productId,
			providerId,
			name: "Taller",
			productType: "tour",
			publicationState: "draft",
			dataClass: "production",
		},
		{
			id: otherProductId,
			providerId,
			name: "Otra experiencia",
			productType: "tour",
			dataClass: "fixture",
		},
	])
	await db
		.insert(Tour)
		.values([
			{ productId, itineraryJson: [{ step: 1, description: "Crear una pieza" }] },
			{ productId: otherProductId },
		])
	await db
		.insert(Variant)
		.values({ id: variantId, productId, name: "Mañana", kind: "tour_slot", createdAt: new Date() })
	await db.insert(RatePlan).values({ id: ratePlanId, variantId, name: "General" })
	await db.insert(DailyInventory).values({
		id: crypto.randomUUID(),
		variantId,
		date: "2027-05-01",
		totalInventory: 8,
		reservedCount: 3,
	})
	await db.insert(Booking).values({
		id: bookingId,
		providerId,
		ratePlanId,
		checkInDate: "2027-05-01",
		checkOutDate: "2027-05-02",
		totalAmount: 90,
		currency: "BOB",
		guestExpectationsSnapshotJson: { historical: true },
		guestContactSnapshotJson: { productName: "Nombre anterior" },
	})
	await db
		.insert(ProviderDocument)
		.values({ id: documentId, providerId, type: "operating_license", status: "verified" })
	await db
		.insert(ProviderDocumentScope)
		.values({ id: crypto.randomUUID(), providerId, documentId, scopeType: "product", productId })
})

afterAll(async () => {
	await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
	await db.delete(ProviderDocumentScope).where(eq(ProviderDocumentScope.documentId, documentId))
	await db.delete(ProviderDocument).where(eq(ProviderDocument.id, documentId))
	await db.delete(Booking).where(eq(Booking.id, bookingId))
	await db.delete(DailyInventory).where(eq(DailyInventory.variantId, variantId))
	await db.delete(RatePlan).where(eq(RatePlan.id, ratePlanId))
	await db.delete(Variant).where(eq(Variant.id, variantId))
	await db.delete(Tour).where(inArray(Tour.productId, [productId, otherProductId]))
	await db.delete(Product).where(inArray(Product.id, [productId, otherProductId]))
	await db.delete(Provider).where(eq(Provider.id, providerId))
	await db.delete(User).where(eq(User.id, userId))
})

async function protectedRows() {
	return Promise.all([
		db.select().from(DailyInventory).where(eq(DailyInventory.variantId, variantId)),
		db.select().from(Booking).where(eq(Booking.id, bookingId)),
		db.select().from(Variant).where(eq(Variant.id, variantId)),
		db.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)),
		db.select().from(ProviderDocument).where(eq(ProviderDocument.id, documentId)),
		db.select().from(ProviderDocumentScope).where(eq(ProviderDocumentScope.documentId, documentId)),
		db.select().from(Tour).where(eq(Tour.productId, otherProductId)),
		db.select().from(Product).where(eq(Product.id, productId)),
	])
}

it("declares and retries without changing inventory, historical reservations, evidence or another product", async () => {
	const before = await protectedRows()
	await repo.declare(declaration)
	await repo.declare(declaration)
	expect(await protectedRows()).toEqual(before)
	const audits = await db
		.select()
		.from(ProviderAuditLog)
		.where(eq(ProviderAuditLog.entityId, productId))
	expect(audits).toHaveLength(1)
	expect(audits[0]).toMatchObject({
		actorUserId: userId,
		beforeJson: { experienceFormat: null, formatContractVersion: 1 },
		afterJson: { experienceFormat: "workshop", formatContractVersion: 1 },
	})
	const aggregate = await new CatalogReadModelRepository().getProductFullAggregate(
		productId,
		providerId
	)
	expect(aggregate?.subtype).toMatchObject({
		experienceFormat: "workshop",
		formatContractVersion: 1,
	})
})

it("rolls back a classification when its audit fails, then permits a coherent retry", async () => {
	await expect(
		repo.declare({ ...declaration, experienceFormat: "class", actorUserId: crypto.randomUUID() })
	).rejects.toThrow()
	expect(
		(await db.select().from(Tour).where(eq(Tour.productId, productId)))[0].experienceFormat
	).toBe("workshop")
	await repo.declare({ ...declaration, experienceFormat: "class" })
	expect(
		(await db.select().from(Tour).where(eq(Tour.productId, productId)))[0].experienceFormat
	).toBe("class")
})

it("rejects unknown formats and legacy contract downgrades in PostgreSQL", async () => {
	await expect(
		db.update(Tour).set({ experienceFormat: "concert" }).where(eq(Tour.productId, productId))
	).rejects.toThrow()
	await expect(
		db
			.update(Tour)
			.set({ experienceFormat: null, formatContractVersion: 0 })
			.where(eq(Tour.productId, productId))
	).rejects.toThrow()
})

it("rejects unauthenticated, unauthorized and foreign-product direct requests", async () => {
	const call = (body: unknown) =>
		POST({
			request: new Request("http://localhost/api/product/experience-format", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
		} as Parameters<typeof POST>[0])
	session = null
	expect((await call(declaration)).status).toBe(401)
	session = { providerId, userId, permissions: { canEditProfile: false } }
	expect((await call(declaration)).status).toBe(403)
	session.permissions.canEditProfile = true
	expect((await call({ productId, experienceFormat: "concert" })).status).toBe(400)
	session.providerId = crypto.randomUUID()
	expect((await call({ productId, experienceFormat: "guided_tour" })).status).toBe(403)
	session.providerId = providerId
	expect((await call({ productId, experienceFormat: "tasting" })).status).toBe(200)
})

it("migrates a historical row without classification and is idempotent without grandfathering new inserts", async () => {
	const migration = await readFile("db/migrations/2026-10-10_experience_format.sql", "utf8")
	const sentinel = new Error("rollback certification")
	await expect(
		db.transaction(async (tx) => {
			await tx.execute(
				sql.raw(
					'CREATE TEMP TABLE "Tour" ("productId" text PRIMARY KEY, "itineraryJson" jsonb) ON COMMIT DROP'
				)
			)
			await tx.execute(
				sql.raw(
					'CREATE TEMP TABLE "CompliancePolicyVersion" ("id" text, "status" text, "contextJson" jsonb) ON COMMIT DROP'
				)
			)
			await tx.execute(sql.raw(`INSERT INTO "Tour" VALUES ('historical', '["Old itinerary"]')`))
			await tx.execute(sql.raw(migration))
			await tx.execute(sql.raw(migration))
			const historical = await tx.execute(sql.raw('SELECT * FROM "Tour"'))
			expect(historical[0]).toMatchObject({
				productId: "historical",
				experienceFormat: null,
				formatContractVersion: 0,
				itineraryJson: ["Old itinerary"],
			})
			await tx.execute(sql.raw(`INSERT INTO "Tour" ("productId") VALUES ('new')`))
			const fresh = await tx.execute(sql.raw(`SELECT * FROM "Tour" WHERE "productId" = 'new'`))
			expect(fresh[0].formatContractVersion).toBe(1)
			throw sentinel
		})
	).rejects.toBe(sentinel)
})

it("refuses an attempt to insert a fresh row with the historical exemption", async () => {
	await expect(
		db.insert(Tour).values({ productId: crypto.randomUUID(), formatContractVersion: 0 })
	).rejects.toThrow()
})

it("enforces explicit policy formats and keeps signed contexts immutable in PostgreSQL", async () => {
	const base = await readFile("db/migrations/2026-10-10_experience_format.sql", "utf8")
	const guard = await readFile(
		"db/migrations/2026-10-10_experience_policy_context_guard.sql",
		"utf8"
	)
	for (const command of [
		`INSERT INTO "CompliancePolicyVersion" VALUES ('bad', 'draft', '{"contextVersion":null}')`,
		`INSERT INTO "CompliancePolicyVersion" VALUES ('bad', 'draft', '{"contextVersion":1,"experienceFormats":["workshop"]}')`,
		`INSERT INTO "CompliancePolicyVersion" VALUES ('bad', 'draft', '{"contextVersion":2,"experienceFormats":[]}')`,
		`INSERT INTO "CompliancePolicyVersion" VALUES ('bad', 'draft', '{"contextVersion":2,"experienceFormats":["unknown"]}')`,
		`UPDATE "CompliancePolicyVersion" SET "status"='draft' WHERE "id"='signed'`,
		`UPDATE "CompliancePolicyVersion" SET "contextJson"='{"contextVersion":2,"experienceFormats":["class"]}' WHERE "id"='signed'`,
	]) {
		await expect(
			db.transaction(async (tx) => {
				await tx.execute(
					sql.raw('CREATE TEMP TABLE "Tour" ("productId" text PRIMARY KEY) ON COMMIT DROP')
				)
				await tx.execute(
					sql.raw(
						'CREATE TEMP TABLE "CompliancePolicyVersion" ("id" text, "status" text, "contextJson" jsonb) ON COMMIT DROP'
					)
				)
				await tx.execute(sql.raw(base))
				await tx.execute(sql.raw(guard))
				await tx.execute(
					sql.raw(
						`INSERT INTO "CompliancePolicyVersion" VALUES ('signed', 'published', '{"contextVersion":2,"experienceFormats":["workshop"]}')`
					)
				)
				await tx.execute(sql.raw(command))
			})
		).rejects.toThrow()
	}
})
