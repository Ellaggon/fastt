import { describe, expect, it } from "vitest"

import { evaluateChannelManagerPreflight } from "@/lib/channel-manager/channel-manager-preflight"

const localCatalog = {
	products: [{ id: "product_1", label: "Hotel Sol", entityType: "product" as const }],
	variants: [
		{
			id: "variant_1",
			label: "Hotel Sol / Deluxe",
			name: "Deluxe",
			entityType: "variant" as const,
			productId: "product_1",
			productName: "Hotel Sol",
			productPublished: true,
			sellable: true,
		},
	],
	ratePlans: [
		{
			id: "rate_1",
			label: "Hotel Sol / Deluxe / BAR",
			name: "BAR",
			entityType: "rate_plan" as const,
			variantId: "variant_1",
			variantName: "Deluxe",
			isDefault: true,
			productPublished: true,
			sellable: true,
		},
	],
	taxes: [],
}

const property = {
	id: "property_1",
	name: "Hotel Sol",
	city: "Santiago",
	country: "CL",
	currency: "USD",
	timezone: "America/Santiago",
	active: true,
}

const room = {
	id: "room_1",
	name: "Deluxe",
	propertyId: "property_1",
	units: 2,
	maxAdults: 2,
	maxChildren: 0,
}

const rate = {
	id: "remote_rate_1",
	name: "BAR",
	propertyId: "property_1",
	roomTypeId: "room_1",
	currency: "USD",
	derived: false,
	readOnly: false,
}

const mappings = [
	{
		id: "mapping_room",
		mappingType: "room_type",
		localEntityType: "variant",
		localEntityId: "variant_1",
		externalEntityType: "room_type",
		externalEntityId: "room_1",
		status: "active",
		metadataJson: { source: "suggestion" },
	},
	{
		id: "mapping_rate",
		mappingType: "rate_plan",
		localEntityType: "rate_plan",
		localEntityId: "rate_1",
		externalEntityType: "rate_plan",
		externalEntityId: "remote_rate_1",
		status: "active",
		metadataJson: { source: "user" },
	},
]

function evaluate(overrides: Record<string, unknown> = {}) {
	return evaluateChannelManagerPreflight({
		selectedPropertyId: "property_1",
		providerProfile: { timezone: "America/Santiago", defaultCurrency: "USD" },
		properties: [property],
		roomTypes: [room],
		ratePlans: [rate],
		localCatalog,
		mappings,
		...overrides,
	})
}

describe("channel manager production preflight", () => {
	it("proves full sellable coverage before production", () => {
		const result = evaluate()

		expect(result.readyForProduction).toBe(true)
		expect(result.steps.map((step) => `${step.label}:${step.status}`)).toEqual([
			"Acceso:complete",
			"Propiedad:complete",
			"Habitaciones:complete",
			"Tarifas:complete",
			"Cobertura:complete",
		])
		expect(result.summary).toMatchObject({
			sellableRoomTypes: 1,
			mappedSellableRoomTypes: 1,
			sellableRatePlans: 1,
			mappedSellableRatePlans: 1,
			manualMappings: 1,
		})
	})

	it("blocks inactive properties and profile currency or timezone mismatches", () => {
		const result = evaluate({
			properties: [{ ...property, active: false, currency: "EUR", timezone: "Europe/Madrid" }],
		})

		expect(result.readyForProduction).toBe(false)
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				"PREFLIGHT_PROPERTY_INACTIVE",
				"PREFLIGHT_PROPERTY_CURRENCY_MISMATCH",
				"PREFLIGHT_PROPERTY_TIMEZONE_MISMATCH",
			])
		)
	})

	it("blocks unmapped sellable inventory and partial remote catalogs", () => {
		const result = evaluate({ mappings: [], remotePartial: true })

		expect(result.readyForProduction).toBe(false)
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				"PREFLIGHT_SELLABLE_ROOM_UNMAPPED",
				"PREFLIGHT_SELLABLE_RATE_UNMAPPED",
				"PREFLIGHT_REMOTE_CATALOG_PARTIAL",
			])
		)
	})

	it("detects duplicate, inactive and orphan mappings", () => {
		const result = evaluate({
			mappings: [
				...mappings,
				{ ...mappings[0], id: "mapping_room_duplicate" },
				{ ...mappings[0], id: "mapping_inactive", status: "inactive" },
				{
					...mappings[1],
					id: "mapping_orphan",
					localEntityId: "missing_rate",
					externalEntityId: "missing_remote_rate",
				},
			],
		})

		expect(result.readyForProduction).toBe(false)
		expect(result.summary).toMatchObject({
			inactiveMappings: 1,
			orphanMappings: 1,
		})
		expect(result.summary.duplicateMappings).toBeGreaterThan(0)
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				"PREFLIGHT_MAPPING_DUPLICATED",
				"PREFLIGHT_MAPPING_INACTIVE",
				"PREFLIGHT_MAPPING_LOCAL_ORPHAN",
			])
		)
	})

	it("validates rate-plan ownership through the mapped room", () => {
		const result = evaluate({
			roomTypes: [room, { ...room, id: "room_2", name: "Suite" }],
			ratePlans: [{ ...rate, roomTypeId: "room_2" }],
		})

		expect(result.readyForProduction).toBe(false)
		expect(result.issues.map((issue) => issue.code)).toContain("PREFLIGHT_RATE_MAPPING_WRONG_ROOM")
	})

	it("keeps later stages pending when access fails instead of reporting false orphans", () => {
		const result = evaluate({
			properties: [],
			roomTypes: [],
			ratePlans: [],
			progress: { access: false, properties: false, rooms: false, rates: false },
			stageErrors: { access: "Acceso inválido" },
		})

		expect(result.readyForProduction).toBe(false)
		expect(result.steps.map((step) => step.status)).toEqual([
			"error",
			"pending",
			"pending",
			"pending",
			"pending",
		])
		expect(result.issues.map((issue) => issue.code)).toEqual(["PREFLIGHT_ACCESS_FAILED"])
	})

	it("asks for a property without falsely failing rooms or rates", () => {
		const result = evaluate({
			selectedPropertyId: null,
			roomTypes: [],
			ratePlans: [],
			progress: { access: true, properties: true, rooms: false, rates: false },
		})

		expect(result.steps.map((step) => `${step.key}:${step.status}:${step.summary}`)).toEqual([
			"access:complete:Credencial validada",
			"property:error:Requiere atención",
			"rooms:pending:Pendiente",
			"rates:pending:Pendiente",
			"coverage:pending:Pendiente",
		])
		expect(result.issues.map((issue) => issue.code)).toEqual(["PREFLIGHT_PROPERTY_REQUIRED"])
	})
})
