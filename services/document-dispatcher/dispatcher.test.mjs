import { test } from "node:test"
import assert from "node:assert/strict"
import { dispatcherConfig, dispatch } from "./dispatcher.mjs"

test("requires exact HTTPS origin and dedicated token", () => {
	for (const origin of [
		"http://example.com",
		"https://u:p@example.com",
		"https://example.com/path",
	])
		assert.throws(() =>
			dispatcherConfig({
				DOCUMENT_PROCESSING_APP_ORIGIN: origin,
				DOCUMENT_PROCESSING_WORKER_TOKEN: "a".repeat(32),
			})
		)
	assert.throws(() => dispatcherConfig({ DOCUMENT_PROCESSING_APP_ORIGIN: "https://example.com" }))
})
test("only counts are returned, errors never become success", async () => {
	const config = dispatcherConfig({
		DOCUMENT_PROCESSING_APP_ORIGIN: "https://example.com",
		DOCUMENT_PROCESSING_WORKER_TOKEN: "a".repeat(32),
	})
	const result = {
		ok: true,
		claimed: 1,
		completed: 1,
		blocked: 0,
		retry: 0,
		failed: 0,
		skipped: 0,
		privateData: "not logged",
	}
	const counts = await dispatch(config, async (url, options) => {
		assert.equal(url.pathname, "/api/cron/document-processing")
		assert.equal(options.redirect, "error")
		return Response.json(result)
	})
	assert.equal(counts.privateData, undefined)
	await assert.rejects(dispatch(config, async () => new Response("failed", { status: 503 })))
	await assert.rejects(dispatch(config, async () => Response.json({ ok: true })))
})
