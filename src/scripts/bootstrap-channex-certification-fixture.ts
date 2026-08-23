import "dotenv/config"

import {
	and,
	db,
	Destination,
	DailyInventory,
	eq,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	Hotel,
	Product,
	ProductStatus,
	Provider,
	ProviderIntegrationCertification,
	ProviderIntegrationConnection,
	ProviderIntegrationCredential,
	ProviderProfile,
	ProviderUser,
	RatePlan,
	RatePlanOccupancyPolicy,
	sql,
	User,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
} from "@/shared/infrastructure/db/compat"
import { closePostgresClients } from "@/shared/infrastructure/db/client"
import { waitForProviderConfigurationRefreshes } from "@/lib/cache/invalidation"
import { createChannelManagerAdapter } from "@/lib/channel-manager/channel-manager-adapter-factory"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { connectProviderIntegration } from "@/lib/provider-integrations"
import { decryptProviderIntegrationSecret } from "@/lib/provider-integration-vault"
import { upsertProviderIntegrationMappings } from "@/lib/provider-integration-operations"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

const PROVIDER_ID = "fastt-channex-certification-provider-v1"
const ACTOR_USER_ID = "fastt-channex-certification-operator-v1"
const ACTOR_EMAIL = "channex-certification@fastt.invalid"
const DESTINATION_ID = "fastt-channex-certification-lab-v1"
const PRODUCT_ID = "fastt-channex-certification-hotel-v1"
const CERTIFICATION_ID = "fastt-channex-certification-session-v1"
const DAYS = 500
const OCCUPANCY_KEY = buildOccupancyKey({ adults: 2, children: 0, infants: 0 })
const FIXTURE_VERSION = "channex-certification-fixture-v1"

const rooms = [
	{
		id: "fastt-channex-certification-room-standard-v1",
		name: "Twin Room QA",
		externalName: "Twin Room",
		units: 3,
	},
	{
		id: "fastt-channex-certification-room-deluxe-v1",
		name: "Double Room QA",
		externalName: "Double Room",
		units: 2,
	},
] as const

const ratePlans = [
	{
		id: "fastt-channex-certification-rate-standard-flex-v1",
		variantId: rooms[0].id,
		name: "Best Available Rate QA",
		externalName: "Best Available Rate",
		basePrice: 110,
		default: true,
	},
	{
		id: "fastt-channex-certification-rate-standard-refundable-v1",
		variantId: rooms[0].id,
		name: "Bed & Breakfast QA",
		externalName: "Bed & Breakfast",
		basePrice: 128,
		default: false,
	},
	{
		id: "fastt-channex-certification-rate-deluxe-flex-v1",
		variantId: rooms[1].id,
		name: "Best Available Rate QA",
		externalName: "Best Available Rate",
		basePrice: 164,
		default: true,
	},
	{
		id: "fastt-channex-certification-rate-deluxe-refundable-v1",
		variantId: rooms[1].id,
		name: "Bed & Breakfast QA",
		externalName: "Bed & Breakfast",
		basePrice: 188,
		default: false,
	},
] as const

function requiredEnv(name: string): string {
	const value = String(process.env[name] ?? "").trim()
	if (!value) throw new Error(`${name}_REQUIRED`)
	return value
}

function isoDate(offset: number): string {
	const date = new Date()
	date.setUTCHours(0, 0, 0, 0)
	date.setUTCDate(date.getUTCDate() + offset)
	return date.toISOString().slice(0, 10)
}

function inBatches<T>(values: T[], size = 250): T[][] {
	const batches: T[][] = []
	for (let index = 0; index < values.length; index += size)
		batches.push(values.slice(index, index + size))
	return batches
}

async function ensureFixtureIdentity() {
	const existingProvider = await db
		.select({ accountPurpose: Provider.accountPurpose })
		.from(Provider)
		.where(eq(Provider.id, PROVIDER_ID))
		.then((rows) => rows[0] ?? null)
	if (existingProvider && existingProvider.accountPurpose !== "integration_certification") {
		throw new Error("CERTIFICATION_FIXTURE_PROVIDER_ID_COLLISION")
	}

	const existingActor = await db
		.select({ email: User.email })
		.from(User)
		.where(eq(User.id, ACTOR_USER_ID))
		.then((rows) => rows[0] ?? null)
	if (existingActor && existingActor.email !== ACTOR_EMAIL) {
		throw new Error("CERTIFICATION_FIXTURE_ACTOR_ID_COLLISION")
	}

	const now = new Date()
	await db
		.insert(User)
		.values({
			id: ACTOR_USER_ID,
			email: ACTOR_EMAIL,
			username: "channex-certification",
			firstName: "Fastt",
			lastName: "Certification",
			registrationDate: now,
		})
		.onConflictDoNothing()

	await db
		.insert(Provider)
		.values({
			id: PROVIDER_ID,
			legalName: "Fastt Channex Certification Fixture",
			displayName: "Channex certification fixture",
			status: "internal",
			accountPurpose: "integration_certification",
			dataClassification: "fixture",
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [Provider.id],
			set: {
				legalName: "Fastt Channex Certification Fixture",
				displayName: "Channex certification fixture",
				status: "internal",
				accountPurpose: "integration_certification",
				dataClassification: "fixture",
			},
		})

	await db
		.insert(ProviderProfile)
		.values({
			providerId: PROVIDER_ID,
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: ACTOR_EMAIL,
			professionalToolsEnabled: true,
			professionalToolsUpdatedAt: now,
			professionalToolsUpdatedBy: ACTOR_USER_ID,
		})
		.onConflictDoUpdate({
			target: [ProviderProfile.providerId],
			set: {
				timezone: "America/Santiago",
				defaultCurrency: "USD",
				supportEmail: ACTOR_EMAIL,
				professionalToolsEnabled: true,
				professionalToolsUpdatedAt: now,
				professionalToolsUpdatedBy: ACTOR_USER_ID,
			},
		})

	await db
		.insert(ProviderUser)
		.values({
			id: `${PROVIDER_ID}:operator`,
			providerId: PROVIDER_ID,
			userId: ACTOR_USER_ID,
			role: "owner",
			permissionsJson: {
				canManageIntegrations: true,
				canRunIntegrationCertification: true,
			},
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [ProviderUser.providerId, ProviderUser.userId],
			set: {
				role: "owner",
				permissionsJson: {
					canManageIntegrations: true,
					canRunIntegrationCertification: true,
				},
			},
		})
}

async function ensureLocalFixtureData() {
	const now = new Date()
	await db
		.insert(Destination)
		.values({
			id: DESTINATION_ID,
			name: "Fastt Certification Lab",
			type: "city",
			country: "united states",
			department: "qa",
			slug: "fastt-channex-certification-lab-v1",
		})
		.onConflictDoNothing()
	await db
		.insert(Product)
		.values({
			id: PRODUCT_ID,
			name: "Hotel de certificación Channex (no comercial)",
			productType: "hotel",
			providerId: PROVIDER_ID,
			destinationId: DESTINATION_ID,
			creationDate: now,
			lastUpdated: now,
		})
		.onConflictDoUpdate({
			target: [Product.id],
			set: {
				name: "Hotel de certificación Channex (no comercial)",
				providerId: PROVIDER_ID,
				destinationId: DESTINATION_ID,
				lastUpdated: now,
			},
		})
	await db
		.insert(Hotel)
		.values({ productId: PRODUCT_ID, stars: 3, email: ACTOR_EMAIL })
		.onConflictDoUpdate({ target: [Hotel.productId], set: { stars: 3, email: ACTOR_EMAIL } })
	await db
		.insert(ProductStatus)
		.values({ productId: PRODUCT_ID, state: "draft", validationErrorsJson: [] })
		.onConflictDoUpdate({
			target: [ProductStatus.productId],
			set: { state: "draft", validationErrorsJson: [] },
		})

	for (const room of rooms) {
		await db
			.insert(Variant)
			.values({
				id: room.id,
				productId: PRODUCT_ID,
				name: room.name,
				description: "Datos sintéticos para certificación de Channex; no vendible.",
				kind: "hotel_room",
				status: "sellable",
				createdAt: now,
				confirmationType: "instant",
				externalCode: `cert-${room.id.slice(-16)}`,
				isActive: true,
			})
			.onConflictDoUpdate({
				target: [Variant.id],
				set: {
					productId: PRODUCT_ID,
					name: room.name,
					status: "sellable",
					isActive: true,
				},
			})
		await db
			.insert(VariantCapacity)
			.values({
				variantId: room.id,
				minOccupancy: 1,
				maxOccupancy: 2,
				maxAdults: 2,
				maxChildren: 0,
			})
			.onConflictDoUpdate({
				target: [VariantCapacity.variantId],
				set: { minOccupancy: 1, maxOccupancy: 2, maxAdults: 2, maxChildren: 0 },
			})
		await db
			.insert(VariantInventoryConfig)
			.values({
				variantId: room.id,
				defaultTotalUnits: room.units,
				horizonDays: DAYS,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: [VariantInventoryConfig.variantId],
				set: { defaultTotalUnits: room.units, horizonDays: DAYS },
			})
	}

	for (const plan of ratePlans) {
		await db
			.insert(RatePlan)
			.values({
				id: plan.id,
				variantId: plan.variantId,
				name: plan.name,
				description: "Tarifa sintética de certificación; no comercial.",
				isDefault: plan.default,
				isActive: true,
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: [RatePlan.id],
				set: {
					variantId: plan.variantId,
					name: plan.name,
					isDefault: plan.default,
					isActive: true,
				},
			})
		await db
			.insert(RatePlanOccupancyPolicy)
			.values({
				id: `${plan.id}:occupancy`,
				ratePlanId: plan.id,
				baseAmount: plan.basePrice,
				baseCurrency: "USD",
				baseAdults: 2,
				baseChildren: 0,
				extraAdultMode: "none",
				extraAdultValue: 0,
				childMode: "none",
				childValue: 0,
				currency: "USD",
				effectiveFrom: new Date(`${isoDate(-1)}T00:00:00.000Z`),
				effectiveTo: new Date(`${isoDate(DAYS)}T00:00:00.000Z`),
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: [RatePlanOccupancyPolicy.id],
				set: {
					baseAmount: plan.basePrice,
					baseCurrency: "USD",
					currency: "USD",
					effectiveFrom: new Date(`${isoDate(-1)}T00:00:00.000Z`),
					effectiveTo: new Date(`${isoDate(DAYS)}T00:00:00.000Z`),
				},
			})
	}

	const dates = Array.from({ length: DAYS }, (_, offset) => ({ offset, date: isoDate(offset) }))
	for (const room of rooms) {
		const inventory = dates.map(({ offset, date }) => {
			const reservedCount = offset % 31 === 0 ? room.units : offset % 7 === 0 ? 1 : 0
			return {
				id: `${room.id}:inventory:${date}`,
				variantId: room.id,
				date,
				totalInventory: room.units,
				reservedCount,
				createdAt: now,
				updatedAt: now,
			}
		})
		const availability = inventory.map((row) => ({
			id: `${room.id}:availability:${row.date}`,
			variantId: room.id,
			date: row.date,
			totalUnits: room.units,
			heldUnits: 0,
			bookedUnits: row.reservedCount,
			externalBlockedUnits: 0,
			availableUnits: Math.max(0, room.units - row.reservedCount),
			computedAt: now,
		}))
		for (const batch of inBatches(inventory)) {
			await db
				.insert(DailyInventory)
				.values(batch)
				.onConflictDoUpdate({
					target: [DailyInventory.variantId, DailyInventory.date],
					set: {
						totalInventory: room.units,
						reservedCount: sql`excluded."reservedCount"`,
						updatedAt: now,
					},
				})
		}
		for (const batch of inBatches(availability)) {
			await db
				.insert(EffectiveAvailability)
				.values(batch)
				.onConflictDoUpdate({
					target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
					set: {
						totalUnits: room.units,
						bookedUnits: sql`excluded."bookedUnits"`,
						availableUnits: sql`excluded."availableUnits"`,
						computedAt: now,
					},
				})
		}
	}

	for (const plan of ratePlans) {
		const pricing = dates.map(({ offset, date }) => {
			const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
			const seasonal = Math.floor(offset / 30) % 3
			const price = plan.basePrice + (weekday === 5 || weekday === 6 ? 18 : 0) + seasonal * 7
			return {
				id: `${plan.id}:price:${date}`,
				variantId: plan.variantId,
				ratePlanId: plan.id,
				date,
				occupancyKey: OCCUPANCY_KEY,
				baseComponent: price,
				occupancyAdjustment: 0,
				ruleAdjustment: 0,
				finalBasePrice: price,
				currency: "USD",
				computedAt: now,
				sourceVersion: FIXTURE_VERSION,
			}
		})
		const restrictions = dates.map(({ offset, date }) => ({
			id: `${plan.id}:restriction:${date}`,
			variantId: plan.variantId,
			ratePlanId: plan.id,
			date,
			minStay: offset % 19 === 0 ? 2 : 1,
			maxStay: offset % 37 === 0 ? 7 : null,
			minLeadTime: null,
			maxLeadTime: null,
			cta: offset % 83 === 0,
			ctd: offset % 89 === 0,
			stopSell: offset % 31 === 0,
			priority: 900,
			computedAt: now,
		}))
		for (const batch of inBatches(pricing)) {
			await db
				.insert(EffectivePricingV2)
				.values(batch)
				.onConflictDoUpdate({
					target: [
						EffectivePricingV2.variantId,
						EffectivePricingV2.ratePlanId,
						EffectivePricingV2.date,
						EffectivePricingV2.occupancyKey,
					],
					set: {
						baseComponent: sql`excluded."baseComponent"`,
						finalBasePrice: sql`excluded."finalBasePrice"`,
						currency: "USD",
						computedAt: now,
						sourceVersion: FIXTURE_VERSION,
					},
				})
		}
		for (const batch of inBatches(restrictions)) {
			await db
				.insert(EffectiveRestriction)
				.values(batch)
				.onConflictDoUpdate({
					target: [
						EffectiveRestriction.variantId,
						EffectiveRestriction.ratePlanId,
						EffectiveRestriction.date,
					],
					set: {
						minStay: sql`excluded."minStay"`,
						maxStay: sql`excluded."maxStay"`,
						cta: sql`excluded."cta"`,
						ctd: sql`excluded."ctd"`,
						stopSell: sql`excluded."stopSell"`,
						computedAt: now,
					},
				})
		}
	}
}

async function ensureSandboxConnection(apiKey: string) {
	const configuredPropertyId =
		String(process.env.CHANNEX_CERTIFICATION_PROPERTY_ID ?? "").trim() || null
	const existing = await db
		.select({
			id: ProviderIntegrationConnection.id,
			externalPropertyId: ProviderIntegrationConnection.externalPropertyId,
		})
		.from(ProviderIntegrationConnection)
		.where(
			and(
				eq(ProviderIntegrationConnection.providerId, PROVIDER_ID),
				eq(ProviderIntegrationConnection.connectorKey, "channel_manager"),
				eq(ProviderIntegrationConnection.vendorKey, "channex"),
				eq(ProviderIntegrationConnection.mode, "sandbox")
			)
		)
		.then((rows) => rows[0] ?? null)
	const externalPropertyId = configuredPropertyId || existing?.externalPropertyId || null

	const connectionId = await connectProviderIntegration({
		providerId: PROVIDER_ID,
		currentUserId: ACTOR_USER_ID,
		connectorKey: "channel_manager",
		mode: "sandbox",
		scopes: ["availability:sync", "rates:sync", "restrictions:sync", "bookings:read"],
		credentialSecret: apiKey,
		connectionId: existing?.id ?? null,
		createNew: !existing,
		displayName: "Channex staging certification",
		vendorKey: "channex",
		authType: "api_key",
		externalPropertyId,
	})

	const credential = await db
		.select({
			authType: ProviderIntegrationCredential.authType,
			encryptedJson: ProviderIntegrationCredential.encryptedJson,
		})
		.from(ProviderIntegrationCredential)
		.where(eq(ProviderIntegrationCredential.connectionId, connectionId))
		.then((rows) => rows[0] ?? null)
	if (!credential || JSON.stringify(credential.encryptedJson).includes(apiKey)) {
		throw new Error("CERTIFICATION_FIXTURE_VAULT_WRITE_FAILED")
	}
	const decrypted = decryptProviderIntegrationSecret({
		providerId: PROVIDER_ID,
		connectionId,
		authType: credential.authType,
		encrypted: credential.encryptedJson,
	})
	if (decrypted.authType === "oauth2" || decrypted.secret !== apiKey) {
		throw new Error("CERTIFICATION_FIXTURE_VAULT_VERIFICATION_FAILED")
	}

	let remotePropertyVerified = false
	let remoteRoomCount = 0
	let remoteRatePlanCount = 0
	let remoteRoomTypes: Array<{ id: string; name: string }> = []
	let remoteRatePlans: Array<{ id: string; name: string; roomTypeId: string | null }> = []
	if (externalPropertyId) {
		const adapter = createChannelManagerAdapter({
			vendorKey: "channex",
			credentialSecret: apiKey,
			mode: "sandbox",
		})
		if (!adapter) throw new Error("CERTIFICATION_FIXTURE_ADAPTER_UNAVAILABLE")
		const [properties, remoteRooms, remoteRatesResponse] = await Promise.all([
			adapter.listProperties(),
			adapter.listRoomTypes({ propertyId: externalPropertyId }),
			adapter.listRatePlans({ propertyId: externalPropertyId }),
		])
		remotePropertyVerified = properties.items.some((item) => item.id === externalPropertyId)
		if (!remotePropertyVerified) throw new Error("CHANNEX_CERTIFICATION_PROPERTY_NOT_FOUND")
		remoteRoomTypes = remoteRooms.items.map((item) => ({ id: item.id, name: item.name }))
		remoteRatePlans = remoteRatesResponse.items
			.filter((item) => !item.readOnly)
			.map((item) => ({ id: item.id, name: item.name, roomTypeId: item.roomTypeId ?? null }))
		remoteRoomCount = remoteRoomTypes.length
		remoteRatePlanCount = remoteRatePlans.length
		if (remoteRoomCount < rooms.length)
			throw new Error("CHANNEX_CERTIFICATION_REMOTE_ROOM_COVERAGE")
		if (remoteRatePlanCount < ratePlans.length) {
			throw new Error("CHANNEX_CERTIFICATION_REMOTE_RATE_PLAN_COVERAGE")
		}
	}
	return {
		connectionId,
		remotePropertyVerified,
		remotePropertyConfigured: Boolean(externalPropertyId),
		remoteRoomCount,
		remoteRatePlanCount,
		remoteRoomTypes,
		remoteRatePlans,
	}
}

function exactRemoteMatch<T extends { id: string; name: string }>(
	items: T[],
	expectedName: string,
	code: string
): T {
	const matches = items.filter(
		(item) => item.name.trim().toLocaleLowerCase() === expectedName.toLocaleLowerCase()
	)
	if (matches.length !== 1) throw new Error(`${code}:${expectedName}`)
	return matches[0]
}

async function ensureCertificationMappings(params: {
	connectionId: string
	remoteRoomTypes: Array<{ id: string; name: string }>
	remoteRatePlans: Array<{ id: string; name: string; roomTypeId: string | null }>
}) {
	if (!params.remoteRoomTypes.length && !params.remoteRatePlans.length) return { applied: 0 }
	const roomMappings = rooms.map((room) => {
		const remote = exactRemoteMatch(
			params.remoteRoomTypes,
			room.externalName,
			"CHANNEX_CERTIFICATION_ROOM_MAPPING_AMBIGUOUS"
		)
		return { room, remote }
	})
	const roomExternalByLocal = new Map(roomMappings.map(({ room, remote }) => [room.id, remote.id]))
	const rateMappings = ratePlans.map((plan) => {
		const roomTypeId = roomExternalByLocal.get(plan.variantId)
		const matches = params.remoteRatePlans.filter(
			(rate) =>
				rate.roomTypeId === roomTypeId &&
				rate.name.trim().toLocaleLowerCase() === plan.externalName.toLocaleLowerCase()
		)
		if (matches.length !== 1) {
			throw new Error(`CHANNEX_CERTIFICATION_RATE_MAPPING_AMBIGUOUS:${plan.externalName}`)
		}
		return { plan, remote: matches[0] }
	})
	const ids = await upsertProviderIntegrationMappings({
		providerId: PROVIDER_ID,
		connectionId: params.connectionId,
		inputs: [
			...roomMappings.map(({ room, remote }) => ({
				mappingType: "room_type",
				localEntityType: "variant",
				localEntityId: room.id,
				externalEntityType: "room_type",
				externalEntityId: remote.id,
				externalEntityName: remote.name,
				direction: "bidirectional" as const,
				metadataJson: { source: "certification_fixture", fixtureVersion: FIXTURE_VERSION },
			})),
			...rateMappings.map(({ plan, remote }) => ({
				mappingType: "rate_plan",
				localEntityType: "rate_plan",
				localEntityId: plan.id,
				externalEntityType: "rate_plan",
				externalEntityId: remote.id,
				externalEntityName: remote.name,
				direction: "bidirectional" as const,
				metadataJson: { source: "certification_fixture", fixtureVersion: FIXTURE_VERSION },
			})),
		],
	})
	return { applied: ids.length }
}

async function ensureCertificationSession(connectionId: string) {
	const now = new Date()
	const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
	const existing = await db
		.select({ id: ProviderIntegrationCertification.id })
		.from(ProviderIntegrationCertification)
		.where(eq(ProviderIntegrationCertification.id, CERTIFICATION_ID))
		.then((rows) => rows[0] ?? null)
	await db
		.insert(ProviderIntegrationCertification)
		.values({
			id: CERTIFICATION_ID,
			providerId: PROVIDER_ID,
			connectionId,
			vendorKey: "channex",
			fixtureProductId: PRODUCT_ID,
			status: "ready",
			suiteVersion: "channex-pms-certification-v1",
			createdBy: ACTOR_USER_ID,
			activatedBy: ACTOR_USER_ID,
			startedAt: now,
			expiresAt,
			evidenceManifestJson: {
				fixtureVersion: FIXTURE_VERSION,
				data: { rooms: rooms.length, ratePlans: ratePlans.length, days: DAYS, currency: "USD" },
				purpose: "non_commercial_channex_staging_certification",
			},
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [ProviderIntegrationCertification.id],
			set: {
				providerId: PROVIDER_ID,
				connectionId,
				vendorKey: "channex",
				fixtureProductId: PRODUCT_ID,
				status: "ready",
				activatedBy: ACTOR_USER_ID,
				startedAt: now,
				expiresAt,
				evidenceManifestJson: {
					fixtureVersion: FIXTURE_VERSION,
					data: { rooms: rooms.length, ratePlans: ratePlans.length, days: DAYS, currency: "USD" },
					purpose: "non_commercial_channex_staging_certification",
				},
				updatedAt: now,
			},
		})

	await writeProviderAuditLog({
		providerId: PROVIDER_ID,
		actorUserId: ACTOR_USER_ID,
		action: existing
			? "provider.integration.certification_fixture.refreshed"
			: "provider.integration.certification_fixture.created",
		entityType: "ProviderIntegrationCertification",
		entityId: CERTIFICATION_ID,
		beforeJson: existing ? { id: CERTIFICATION_ID } : null,
		afterJson: {
			connectionId,
			status: "ready",
			expiresAt,
			fixtureProductId: PRODUCT_ID,
			vendorKey: "channex",
		},
		riskLevel: "high",
	})
	return { expiresAt }
}

async function main() {
	const apiKey = requiredEnv("CHANNEX_STAGING_API_KEY")
	await ensureFixtureIdentity()
	await ensureLocalFixtureData()
	const connection = await ensureSandboxConnection(apiKey)
	const mappings = await ensureCertificationMappings(connection)
	const certification = await ensureCertificationSession(connection.connectionId)

	console.log(
		JSON.stringify(
			{
				ok: true,
				providerId: PROVIDER_ID,
				accountPurpose: "integration_certification",
				productId: PRODUCT_ID,
				connectionId: connection.connectionId,
				certificationId: CERTIFICATION_ID,
				mode: "sandbox",
				vaultVerified: true,
				remotePropertyConfigured: connection.remotePropertyConfigured,
				remotePropertyVerified: connection.remotePropertyVerified,
				remoteCatalog: {
					rooms: connection.remoteRoomCount,
					ratePlans: connection.remoteRatePlanCount,
				},
				mappings: { applied: mappings.applied },
				fixture: { rooms: rooms.length, ratePlans: ratePlans.length, days: DAYS, currency: "USD" },
				expiresAt: certification.expiresAt.toISOString(),
			},
			null,
			2
		)
	)
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : "CHANNEX_CERTIFICATION_FIXTURE_FAILED")
		process.exitCode = 1
	})
	.finally(async () => {
		await waitForProviderConfigurationRefreshes()
		await closePostgresClients()
	})
