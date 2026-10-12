import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, expect, it } from "vitest"
import { db, eq, Product, Provider, Tour } from "@/shared/infrastructure/db/compat"
import { SubtypeRepository } from "@/modules/catalog/infrastructure/repositories/SubtypeRepository"
const providerId = randomUUID(),
	productId = randomUUID()
const repo = new SubtypeRepository()
const saved = {
	duration: "1 hora",
	durationMinutes: 60,
	meetingPointJson: { address: "Sala 1", instructions: "Entrada lateral", extra: "conservar" },
	itineraryJson: [{ step: 1, description: "Aprender y practicar" }],
	includesJson: ["Materiales"],
	guideJson: { guideType: "Guía histórico" },
	difficultyLevel: "hard",
	pickupJson: { defaultArea: "Centro" },
}
beforeAll(async () => {
	await db
		.insert(Provider)
		.values({ id: providerId, accountPurpose: "commercial", dataClassification: "production" })
	await db
		.insert(Product)
		.values({ id: productId, providerId, productType: "tour", name: "Programa controlado" })
	await db
		.insert(Tour)
		.values({ productId, experienceFormat: "class", formatContractVersion: 1, ...saved })
})
afterAll(async () => {
	await db.delete(Tour).where(eq(Tour.productId, productId))
	await db.delete(Product).where(eq(Product.id, productId))
	await db.delete(Provider).where(eq(Provider.id, providerId))
})
it("saves one class moment and preserves omitted tourist data and JSON keys", async () => {
	const form = new FormData()
	form.set("expectedExperienceFormat", "class")
	form.set("tourItinerary", "Práctica, explicación y reflexión")
	form.set("meetingPointAddress", "Sala 2")
	expect((await repo.saveTourProgram(productId, providerId, form)).status).toBe(200)
	const [row] = await db.select().from(Tour).where(eq(Tour.productId, productId))
	expect(row).toMatchObject({
		...saved,
		meetingPointJson: { ...saved.meetingPointJson, address: "Sala 2" },
		itineraryJson: [{ step: 1, description: "Práctica, explicación y reflexión" }],
	})
})
it("clears an explicitly edited optional field without clearing its neighbors", async () => {
	const form = new FormData()
	form.set("meetingPointInstructions", "")
	expect((await repo.saveTourProgram(productId, providerId, form)).status).toBe(200)
	const [row] = await db.select().from(Tour).where(eq(Tour.productId, productId))
	expect(row.meetingPointJson).toEqual({ address: "Sala 2", extra: "conservar" })
})
it("rejects stale forms and forged formats without mutation", async () => {
	await db
		.update(Tour)
		.set({ experienceFormat: "guided_tour" })
		.where(eq(Tour.productId, productId))
	const [before] = await db.select().from(Tour).where(eq(Tour.productId, productId))
	const form = new FormData()
	form.set("expectedExperienceFormat", "class")
	form.set("tourItinerary", "Uno")
	expect((await repo.saveTourProgram(productId, providerId, form)).status).toBe(409)
	form.delete("expectedExperienceFormat")
	form.set("experienceFormat", "class")
	expect((await repo.saveTourProgram(productId, providerId, form)).status).toBe(400)
	expect((await db.select().from(Tour).where(eq(Tour.productId, productId)))[0]).toEqual(before)
	form.set("tourItinerary", "Inicio\nRecorrido\nCierre")
	expect((await repo.saveTourProgram(productId, providerId, form)).status).toBe(200)
})
it("rejects a foreign provider", async () => {
	expect((await repo.saveTourProgram(productId, randomUUID(), new FormData())).status).toBe(403)
})
