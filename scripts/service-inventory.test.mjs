import test from "node:test"
import assert from "node:assert/strict"
import { inventory, reconcile } from "./service-inventory.mjs"

const evidence = (overrides = {}) => ({
	service: "supabase-db",
	resource: "business-db",
	environment: "production",
	plan: "Free",
	owner: "Engineering",
	currency: "USD",
	monthlyFixed: 0,
	variableAccrued: null,
	periodStart: "2026-11-01",
	periodEnd: "2026-11-30",
	verifiedAt: "2026-11-03",
	renewal: null,
	quotaUsed: 80,
	quotaLimit: 100,
	source: "billing-panel",
	...overrides,
})
const now = new Date("2026-11-03T12:00:00Z")

test("records explicit consumer evidence without conflating environments", () => {
	const link = { component: "Fastt SSR", environment: "production", source: "deployment settings" }
	const report = reconcile(inventory({}), [evidence({ consumers: [link] })], now)
	assert.deepEqual(report.resources[0].consumers, [link])
	assert.throws(() =>
		reconcile(inventory({}), [evidence({ consumers: [{ ...link, environment: "staging" }] })], now)
	)
	assert.throws(() =>
		reconcile(inventory({}), [evidence({ consumers: [{ ...link, secret: "hidden" }] })], now)
	)
})

test("local config cannot identify a production resource or close the audit", () => {
	const local = inventory({ DATABASE_URL: "postgres://secret" }, "development")
	const report = reconcile(local, [evidence()], now)
	assert.equal(report.resources[0].consumer, "investigate-no-local-configuration")
	assert.deepEqual(report.unlinkedConfigurations, [
		{ service: "supabase-db", environment: "development" },
	])
	assert.equal(report.totals.USD.variableAccruedByPeriod["2026-11-01/2026-11-30"].confirmed, null)
	assert.equal(report.complete, false)
})

test("the test profile detects dedicated database configuration only", () => {
	const db = inventory({ DATABASE_URL: "ignored", FASTT_TEST_DATABASE_URL: "secret" }, "test").find(
		(row) => row.service === "supabase-db"
	)
	assert.equal(db.presentFields, 1)
})

test("reconciliation preserves unknown costs and flags quota exposure", () => {
	const report = reconcile(inventory({}), [evidence()], now)
	assert.equal(report.resources[0].quotaWarning, true)
	assert.equal(report.resources[0].consumer, "investigate-no-local-configuration")
	assert.equal(
		report.totals.USD.variableAccruedByPeriod["2026-11-01/2026-11-30"].unknownResources,
		1
	)
	assert.equal(report.complete, false)
})

test("separates currencies and periods without extrapolating usage", () => {
	const report = reconcile(
		inventory({}),
		[
			evidence({ monthlyFixed: 10, variableAccrued: 2 }),
			evidence({
				resource: "staging",
				environment: "staging",
				currency: "EUR",
				monthlyFixed: 3,
				variableAccrued: 1,
			}),
		],
		now
	)
	assert.equal(report.totals.USD.confirmedMonthlyFixed, 10)
	assert.equal(report.totals.EUR.confirmedMonthlyFixed, 3)
	assert.equal(report.totals.USD.variableAccruedByPeriod["2026-11-01/2026-11-30"].confirmed, 2)
})

test("stale evidence is excluded from confirmed baseline", () => {
	const report = reconcile(inventory({}), [evidence({ verifiedAt: "2026-10-01" })], now)
	assert.equal(report.resources[0].stale, true)
	assert.deepEqual(report.totals, {})
})

test("rejects malformed, secret-bearing, duplicate and future evidence", () => {
	for (const entry of [
		evidence({ token: "secret" }),
		evidence({ monthlyFixed: -1 }),
		evidence({ source: "https://secret.example" }),
		evidence({ verifiedAt: "2099-01-01" }),
	]) {
		assert.throws(() => reconcile(inventory({}), [entry], now))
	}
	assert.throws(() => reconcile(inventory({}), [evidence(), evidence()], now))
})

test("empty evidence cannot certify a zero-cost inventory", () => {
	const report = reconcile(inventory({}), [], now)
	assert.equal(report.complete, false)
	assert.ok(report.unverifiedServices.includes("vercel"))
})

test("reports configuration without exposing supplied values", () => {
	const result = inventory({
		DATABASE_URL: "postgres://private:secret@private/db",
		STRIPE_SECRET_KEY: "sensitive-value",
	})
	assert.equal(result.find((row) => row.service === "supabase-db").presentFields, 1)
	assert.equal(JSON.stringify(result).includes("sensitive-value"), false)
	assert.equal(JSON.stringify(result).includes("postgres://"), false)
	assert.ok(result.every((row) => row.billing === "unknown" && row.fixedCost === null))
})

test("missing or blank configuration never proves a service is cancelled or free", () => {
	const result = inventory({ REDIS_URL: "  " })
	assert.equal(result.find((row) => row.service === "redis").presentFields, 0)
	assert.ok(result.every((row) => row.deployment === "unverified" && row.billing === "unknown"))
})
