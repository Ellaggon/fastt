import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
	collectCalls,
	collectImports,
	collectObjectKeys,
	collectHttpExportMethods,
} from "./_guardrail-ast"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const reservationPages = ["src/pages/booking/index.astro", "src/pages/booking/[id].astro"]
const reservationBffs = [
	"src/pages/api/internal/provider-bookings-summary.ts",
	"src/pages/api/internal/booking-summary.ts",
]
const bookingOperationsRepository =
	"src/modules/booking/infrastructure/repositories/BookingOperationsQueryRepository.ts"

const bannedPricingCalls = new Set([
	"computeEffectivePricingV2",
	"computePricePreview",
	"previewPricingRules",
	"ensurePricingCoverage",
	"ensurePricingCoverageRuntime",
	"materializeEffectivePricing",
	"recomputeEffectivePricingV2",
])

const bannedInventoryCalls = new Set([
	"createInventoryHold",
	"releaseInventoryHold",
	"recomputeAvailability",
	"ensureAvailability",
	"consumeInventory",
	"materializeAvailability",
])

describe("Guardrail: Reservations lifecycle enterprise semantics", () => {
	it("keeps Reservations BFFs owned by booking snapshots, not Catalog read models", () => {
		const violations = reservationBffs.flatMap((relativePath) => {
			const imports = collectImports(relativePath)
			return imports.flatMap((entry) => {
				if (entry.module.includes("/modules/catalog/")) {
					return [
						`${relativePath}: reservation lifecycle BFF imports catalog module ${entry.module}`,
					]
				}
				return []
			})
		})

		expect(
			violations,
			`Reservations lifecycle read models must not be routed through Catalog ownership:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("prevents reservation read surfaces from invoking pricing or inventory engines", () => {
		const violations = reservationBffs.flatMap((relativePath) => {
			const imports = collectImports(relativePath)
			const calls = collectCalls(relativePath)
			const importedViolations = imports.flatMap((entry) => {
				if (entry.module.includes("/modules/pricing/") || entry.module.includes("/lib/pricing/")) {
					return [`${relativePath}: imports live pricing module ${entry.module}`]
				}
				if (
					entry.module.includes("/modules/inventory/") ||
					entry.module.includes("/lib/inventory/")
				) {
					return [`${relativePath}: imports live inventory module ${entry.module}`]
				}
				return []
			})
			const callViolations = calls.flatMap((call) => {
				if (bannedPricingCalls.has(call.leaf)) {
					return [`${relativePath}: calls pricing engine ${call.calleePath}`]
				}
				if (bannedInventoryCalls.has(call.leaf)) {
					return [`${relativePath}: calls inventory operation ${call.calleePath}`]
				}
				return []
			})
			return [...importedViolations, ...callViolations]
		})

		expect(
			violations,
			`Reservations read paths may show snapshots, but must not recompute pricing or operate inventory:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps reservation BFFs read-only and free of payments orchestration", () => {
		const violations = reservationBffs.flatMap((relativePath) => {
			const methods = collectHttpExportMethods(relativePath)
			const source = read(relativePath)
			const writeMethods = [...methods]
			const forbiddenPaymentRuntime = [
				/insert\(Payment\)/,
				/update\(Payment\)/,
				/delete\(Payment\)/,
				/PaymentProvider/,
				/settlement/i,
				/psp/i,
			]
			return [
				...writeMethods.map((method) => `${relativePath}: exports ${method} on a read BFF`),
				...forbiddenPaymentRuntime.flatMap((pattern) =>
					pattern.test(source) ? [`${relativePath}: forbidden payments runtime ${pattern}`] : []
				),
			]
		})

		expect(
			violations,
			`Reservations may expose refund handoff visibility, not a payments/refund engine:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps booking pages framed as lifecycle and contract audit surfaces", () => {
		const requiredSignals: Record<string, string[]> = {
			"src/pages/booking/index.astro": [
				"Reservations Lifecycle Hub",
				"Contract-safe lifecycle visibility",
				"Refund handoff",
				"visibilidad derivada",
			],
			"src/pages/booking/[id].astro": [
				"Reservation operational workspace",
				"Contract snapshot audit",
				"Room allocation visibility",
				"visibilidad derivada",
			],
		}

		const violations = Object.entries(requiredSignals).flatMap(([relativePath, signals]) => {
			const source = read(relativePath)
			return signals.flatMap((signal) =>
				source.includes(signal) ? [] : [`${relativePath}: missing "${signal}"`]
			)
		})

		expect(
			violations,
			`Reservations pages must communicate lifecycle operations and immutable contract snapshots:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("blocks CRM, support, analytics, and command-center theater from Reservations", () => {
		const forbiddenTheater = [
			/CRM/i,
			/guest messaging/i,
			/support desk/i,
			/support center/i,
			/AI summary/i,
			/forecast/i,
			/revenue optimization/i,
			/command center/i,
			/dashboard fake/i,
		]
		const violations = reservationPages.flatMap((relativePath) => {
			const source = read(relativePath)
			return forbiddenTheater.flatMap((pattern) =>
				pattern.test(source) ? [`${relativePath}: forbidden reservations theater ${pattern}`] : []
			)
		})

		expect(
			violations,
			`Reservations lifecycle must stay operational and honest, not CRM/support/analytics theater:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("requires immutable textual and guest snapshots in booking materialization", () => {
		const schema = read("db/config.ts")
		const repo = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)
		const requiredSchemaFields = [
			"guestEmailSnapshot",
			"guestNameSnapshot",
			"guestContactSnapshotJson",
			"lifecycleAuditJson",
			"refundHandoffSnapshotJson",
			"contractSnapshotVersion",
			"providerIdSnapshot",
			"productIdSnapshot",
			"productNameSnapshot",
			"variantNameSnapshot",
			"ratePlanNameSnapshot",
			"occupancySnapshotJson",
		]
		const missingSchema = requiredSchemaFields.filter((field) => !schema.includes(field))
		const missingMaterialization = requiredSchemaFields.filter((field) => !repo.includes(field))

		expect(
			[...missingSchema, ...missingMaterialization],
			`Reservations contract snapshots must survive catalog/user edits. Missing fields:\n${[
				...missingSchema.map((field) => `schema:${field}`),
				...missingMaterialization.map((field) => `materialization:${field}`),
			].join("\n")}`
		).toEqual([])
	})

	it("keeps booking read models snapshot-first when exposing labels and guest contact", () => {
		const violations = [bookingOperationsRepository].flatMap((relativePath) => {
			const keys = new Set(collectObjectKeys(relativePath))
			const source = read(relativePath)
			const requiredKeys = [
				"productNameSnapshot",
				"variantNameSnapshot",
				"ratePlanNameSnapshot",
				"hasTextualSnapshot",
			]
			if (relativePath.endsWith("booking-summary.ts")) {
				requiredKeys.push("guestEmailSnapshot", "guestNameSnapshot", "hasGuestSnapshot")
			}
			const missingKeys = requiredKeys.filter((key) => !keys.has(key) && !source.includes(key))
			const fallbackViolations =
				source.includes("productName: row.productName ?? null") ||
				source.includes("variantName: row.variantName ?? null")
					? [`${relativePath}: exposes live catalog labels without snapshot-first fallback`]
					: []
			return [
				...missingKeys.map((key) => `${relativePath}: missing snapshot-first key ${key}`),
				...fallbackViolations,
			]
		})

		expect(
			violations,
			`Reservation BFFs may use live labels only as legacy fallback, never as contract source:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("labels date-based lifecycle as derived visibility, not persisted operations", () => {
		const violations = [bookingOperationsRepository, ...reservationPages].flatMap(
			(relativePath) => {
				const source = read(relativePath)
				const missingDerivedSignal = source.includes("derived_from_snapshot")
					? [`${relativePath}: uses deprecated derived_from_snapshot lifecycle label`]
					: []
				const fakePersistedLifecycle =
					/persisted operational lifecycle|persisted lifecycle state/i.test(source)
						? [`${relativePath}: claims persisted lifecycle operations without runtime support`]
						: []
				const missingVisibilitySignal = source.includes("derived_visibility")
					? []
					: [`${relativePath}: missing derived_visibility lifecycle semantics`]
				return [...missingDerivedSignal, ...fakePersistedLifecycle, ...missingVisibilitySignal]
			}
		)

		expect(
			violations,
			`Reservations must separate lifecycle visibility from real operational lifecycle state:\n${violations.join("\n")}`
		).toEqual([])
	})
})
