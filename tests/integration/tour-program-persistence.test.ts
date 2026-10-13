import { randomUUID } from "node:crypto"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import {
	db,
	eq,
	Product,
	Provider,
	Tour,
	ProductGeoPlace,
	GeoPlace,
	User,
	ProviderAuditLog,
	sql,
} from "@/shared/infrastructure/db/compat"
import { upsertGeoPlace, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { evaluateExperienceProgram } from "@/shared/domain/experience-program"
import { evaluateTourContentReadiness } from "@/lib/tours/tourContentReadiness"
import { ExperienceFormatRepository } from "@/modules/catalog/infrastructure/repositories/ExperienceFormatRepository"
import { getRuntimePostgresDb } from "@/shared/infrastructure/db/client"
const mocks = vi.hoisted(() => ({ session: vi.fn(), refresh: vi.fn() }))
vi.mock("@/lib/auth/providerSessionSurface", () => ({
	getProviderSessionSurfaceFromRequest: mocks.session,
}))
vi.mock("@/container", async () => {
	const { ProductRepository } =
		await import("@/modules/catalog/infrastructure/repositories/ProductRepository")
	const { SubtypeRepository } =
		await import("@/modules/catalog/infrastructure/repositories/SubtypeRepository")
	return { productRepository: new ProductRepository(), subtypeRepository: new SubtypeRepository() }
})
vi.mock("@/lib/cache/invalidation", () => ({ invalidateProduct: async () => {} }))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: mocks.refresh,
}))
import { POST } from "@/pages/api/product/subtype"
let providerId: string, productId: string, geoPlaceId: string, actorUserId: string
const saved = {
	duration: "1 hora",
	durationMinutes: 60,
	meetingPointJson: { address: "Sala 1", instructions: "Entrada lateral", extra: "conservar" },
	itineraryJson: [{ step: 1, description: "Aprender y practicar" }],
	includesJson: ["Materiales"],
	guideJson: { guideType: "Guía histórico", license: "original" },
	difficultyLevel: "hard",
	pickupJson: { defaultArea: "Centro" },
}
const read = async () => (await db.select().from(Tour).where(eq(Tour.productId, productId)))[0]
const call = (fields: Record<string, string> = {}) => {
	const form = new FormData()
	form.set("productId", productId)
	for (const [key, value] of Object.entries(fields)) form.set(key, value)
	return POST({
		request: new Request("http://localhost/api/product/subtype", { method: "POST", body: form }),
	} as never)
}
beforeEach(async (context) => {
	const historical = context.task.name.includes("real route applies null")
	providerId = randomUUID()
	productId = randomUUID()
	geoPlaceId = randomUUID()
	actorUserId = randomUUID()
	mocks.session.mockResolvedValue({ providerId, permissions: { canEditProfile: true } })
	mocks.refresh.mockResolvedValue(undefined)
	await db.insert(Provider).values({
		id: providerId,
		accountPurpose: "integration_certification",
		dataClassification: "production",
	})
	await upsertGeoPlace({
		id: geoPlaceId,
		name: "Programa test",
		type: "city",
		country: "BO",
		slug: `program-${geoPlaceId}`,
	})
	await upsertProduct({
		id: productId,
		providerId,
		productType: "tour",
		name: "Programa controlado",
		geoPlaceId,
		dataClass: "fixture",
	})
	await db.insert(User).values({ id: actorUserId, email: `${actorUserId}@program.test` })
	await db.insert(Tour).values({
		productId,
		experienceFormat: historical ? null : "class",
		formatContractVersion: 1,
		...saved,
	})
})
afterEach(async () => {
	await db.delete(Tour).where(eq(Tour.productId, productId))
	await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, productId))
	await db.delete(Product).where(eq(Product.id, productId))
	await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
	await db.delete(User).where(eq(User.id, actorUserId))
	await db.delete(Provider).where(eq(Provider.id, providerId))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, geoPlaceId))
})
it.each([
	["guided_tour", "Inicio\nCierre", 400],
	["guided_tour", "Inicio\nRecorrido\nCierre", 200],
	["class", "Aprender, practicar, compartir", 200],
	["workshop", "Crear", 200],
	["tasting", "Degustar", 200],
	[null, "Inicio\nCierre", 400],
	[null, "Inicio\nRecorrido\nCierre", 200],
	["guided_tour", "Inicio, recorrido, cierre", 400],
] as const)("real route applies %s to %s (%s)", async (format, program, status) => {
	await db
		.update(Tour)
		.set({ experienceFormat: format, formatContractVersion: 1 })
		.where(eq(Tour.productId, productId))
	const before = await read()
	expect((await call({ tourItinerary: program })).status).toBe(status)
	const after = await read()
	if (status === 400) expect(after).toEqual(before)
	else {
		expect(after).toEqual({
			...before,
			itineraryJson: program
				.split("\n")
				.map((description, index) => ({ step: index + 1, description })),
		})
		const input = {
			experienceFormat: after.experienceFormat,
			durationMinutes: after.durationMinutes,
			meetingPoint: after.meetingPointJson,
			itinerary: after.itineraryJson,
			includes: after.includesJson,
		}
		expect(evaluateExperienceProgram(input).complete).toBe(true)
		const content = evaluateTourContentReadiness(
			{
				subtype: { kind: "tour", ...input, formatContractVersion: after.formatContractVersion },
				displayName: "Fixture",
				geoPlace: { id: geoPlaceId },
				content: { description: "Descripción", highlights: ["Práctica"] },
				location: { lat: null, lng: null },
				images: [],
			} as never,
			{ hasCategory: true, hasActiveTickets: true }
		)
		expect(content.logistics).toBe(true)
		expect(content.complete).toBe(false)
	}
})
it("omitted tourist fields and JSON keys remain exact", async () => {
	const before = await read()
	expect((await call({ tourItinerary: "Práctica", meetingPointAddress: "Sala 2" })).status).toBe(
		200
	)
	expect(await read()).toEqual({
		...before,
		itineraryJson: [{ step: 1, description: "Práctica" }],
		meetingPointJson: { ...saved.meetingPointJson, address: "Sala 2" },
	})
})
it("explicit optional empties remove only edited keys", async () => {
	const before = await read()
	expect((await call({ meetingPointInstructions: "", guideType: "" })).status).toBe(200)
	expect(await read()).toEqual({
		...before,
		meetingPointJson: { address: "Sala 1", extra: "conservar" },
		guideJson: { license: "original" },
	})
})
it("forged format cannot reduce database requirements", async () => {
	await db
		.update(Tour)
		.set({ experienceFormat: "guided_tour" })
		.where(eq(Tour.productId, productId))
	const before = await read()
	expect((await call({ experienceFormat: "class", tourItinerary: "Uno" })).status).toBe(400)
	expect(await read()).toEqual(before)
})
it.each(["session", "permission", "owner"])("rejects %s without writing", async (kind) => {
	const before = await read()
	mocks.session.mockResolvedValue(
		kind === "session"
			? null
			: {
					providerId: kind === "owner" ? randomUUID() : providerId,
					permissions: { canEditProfile: kind !== "permission" },
				}
	)
	expect((await call({ tourItinerary: "Otro" })).status).toBe(kind === "session" ? 401 : 403)
	expect(await read()).toEqual(before)
})
it("stale expected format rejects the complete request", async () => {
	const before = await read()
	expect(
		(await call({ expectedExperienceFormat: "guided_tour", tourItinerary: "Otro" })).status
	).toBe(409)
	expect(await read()).toEqual(before)
})
it("post-commit refresh failure still confirms exact persistence", async () => {
	const before = await read()
	mocks.refresh.mockRejectedValueOnce(new Error("controlled refresh failure"))
	const log = vi.spyOn(console, "error").mockImplementation(() => {})
	try {
		expect((await call({ tourItinerary: "Guardado" })).status).toBe(200)
		expect(await read()).toEqual({
			...before,
			itineraryJson: [{ step: 1, description: "Guardado" }],
		})
	} finally {
		log.mockRestore()
	}
})
it("partial save leaves legacy program untouched", async () => {
	const history = ["Inicio", { title: "Práctica" }, { description: "Cierre" }, {}]
	await db.update(Tour).set({ itineraryJson: history }).where(eq(Tour.productId, productId))
	const before = await read()
	expect((await call({ meetingPointAddress: "Sala histórica" })).status).toBe(200)
	expect(await read()).toEqual({
		...before,
		meetingPointJson: { ...saved.meetingPointJson, address: "Sala histórica" },
	})
})
it("legacy operating fields cause no partial mutation", async () => {
	const before = await read()
	expect((await call({ complianceOperatingRole: "legacy", tourItinerary: "Otro" })).status).toBe(
		400
	)
	expect(await read()).toEqual(before)
})
function barrier() {
	let resolve!: () => void
	const promise = new Promise<void>((done) => {
		resolve = done
	})
	return { promise, resolve }
}
it.each(["declaration-first", "program-first"])(
	"serializes concurrent %s on the product lock",
	async (order) => {
		const entered = barrier(),
			release = barrier()
		const originalTransaction = db.transaction.bind(db)
		let first = true
		// Barrier surrounds the actual transaction; both production repositories still acquire their own row lock.
		const spy = vi.spyOn(getRuntimePostgresDb(), "transaction").mockImplementation(((
			callback: any,
			config: any
		) =>
			originalTransaction(async (tx) => {
				if (first) {
					first = false
					await tx
						.select({ id: Product.id })
						.from(Product)
						.where(eq(Product.id, productId))
						.for("update")
					entered.resolve()
					await release.promise
				}
				return callback(tx)
			}, config)) as typeof db.transaction)
		const declaration = () =>
			new ExperienceFormatRepository().declare({
				productId,
				providerId,
				actorUserId,
				experienceFormat: "guided_tour",
			})
		const program = async () =>
			call({ expectedExperienceFormat: "class", tourItinerary: "Práctica nueva" })
		const before = await read()
		let a: Promise<unknown> | undefined, b: Promise<unknown> | undefined
		try {
			a = order === "declaration-first" ? declaration() : program()
			await entered.promise
			b = order === "declaration-first" ? program() : declaration()
			release.resolve()
			const results = await Promise.all([a, b])
			const response = results[order === "declaration-first" ? 1 : 0] as Response
			expect(response.status).toBe(order === "declaration-first" ? 409 : 200)
			const after = await read()
			expect(after.experienceFormat).toBe("guided_tour")
			expect(after.itineraryJson).toEqual(
				order === "declaration-first"
					? before.itineraryJson
					: [{ step: 1, description: "Práctica nueva" }]
			)
		} finally {
			release.resolve()
			await Promise.allSettled([a, b].filter(Boolean) as Promise<unknown>[])
			spy.mockRestore()
		}
	}
)

it.each([2, 3])(
	"real route preserves a migrated version-0 historical row with %s moments",
	async (count) => {
		const runtime = getRuntimePostgresDb(),
			transaction = runtime.transaction.bind(runtime)
		await transaction(async (tx) => {
			// A connection-local pre-existing legacy fixture; production table and guards are untouched.
			await tx.execute(
				sql.raw(
					'CREATE TEMP TABLE "Tour" (LIKE public."Tour" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP'
				)
			)
			await tx
				.insert(Tour)
				.values({ productId, experienceFormat: null, formatContractVersion: 0, ...saved })
			const before = (await tx.select().from(Tour).where(eq(Tour.productId, productId)))[0]
			const spy = vi
				.spyOn(runtime, "transaction")
				.mockImplementation((async (callback: any) => callback(tx)) as typeof runtime.transaction)
			try {
				const program = ["Inicio", "Práctica", "Cierre"].slice(0, count)
				expect(
					(
						await call({
							tourItinerary: program.join("\n"),
							expectedExperienceFormat: "historical",
						})
					).status
				).toBe(count === 3 ? 200 : 400)
				const after = (await tx.select().from(Tour).where(eq(Tour.productId, productId)))[0]
				expect(after).toEqual(
					count === 3
						? {
								...before,
								itineraryJson: program.map((description, index) => ({
									step: index + 1,
									description,
								})),
							}
						: before
				)
			} finally {
				spy.mockRestore()
			}
		})
	}
)

it("program saves before location and computes duration from visible controls", async () => {
	await db.update(Tour).set({ meetingPointJson: null }).where(eq(Tour.productId, productId))
	const response = await call({
		tourItinerary: "Preparación y práctica",
		tourIncludes: "Materiales",
		durationHours: "1",
		durationPartMinutes: "30",
		durationMinutes: "999",
	})
	expect(response.status).toBe(200)
	const after = await read()
	expect(after.durationMinutes).toBe(90)
	expect(after.duration).toBe("1 hora 30 min")
	expect(after.meetingPointJson).toBeNull()
	const program = evaluateExperienceProgram({
		experienceFormat: "class",
		durationMinutes: after.durationMinutes,
		itinerary: after.itineraryJson,
		includes: after.includesJson,
		meetingPoint: after.meetingPointJson,
	})
	expect(program.programComplete).toBe(true)
	expect(program.checks.meetingPoint).toBe(false)
})
