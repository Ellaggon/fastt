import { test } from "node:test"
import assert from "node:assert/strict"
import { routeForFile, summarize } from "./page-performance-register.mjs"

test("normalizes index and parameterized routes without concrete IDs", () => {
	assert.equal(routeForFile("index.astro"), "/")
	assert.equal(routeForFile("product/[id]/index.astro"), "/product/[id]")
})
const sample = { route: "/product/[id]", phase: "load", durationMs: 600,
	environment: "local-dev", cache: "miss", measuredAt: "2026-11-06T12:00:00Z" }
test("leaves unknown metrics blank, never zero", () => {
	assert.deepEqual(summarize([sample.route], [])[0],
		[sample.route, "load", "pending", "", "", 0, "", "", "", ""])
})
test("separates environment, phase and cache populations", () => {
	const rows = summarize([sample.route], [sample, { ...sample, environment: "production", durationMs: 100 }])
	assert.equal(rows[0][6], 600)
	assert.equal(rows[1][6], 100)
	assert.equal(rows[2][2], "pending")
})
test("rejects credentials, invalid durations and concrete routes", () => {
	for (const change of [{ token: "secret" }, { durationMs: -1 }, { route: "/product/private-id" }])
		assert.throws(() => summarize([sample.route], [{ ...sample, ...change }]))
})
