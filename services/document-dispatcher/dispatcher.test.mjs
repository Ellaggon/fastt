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

test("permits fast loopback ticks only in the explicit isolated certification process", () => {
	const env = {
		DOCUMENT_PROCESSING_APP_ORIGIN: "http://127.0.0.1:4333",
		DOCUMENT_PROCESSING_WORKER_TOKEN: "a".repeat(32),
		DOCUMENT_PROCESSING_LOCAL_CERTIFICATION: "true",
		FASTT_DATA_ENV: "test",
		NODE_ENV: "development",
	}
	assert.equal(dispatcherConfig(env).intervalMs, 2000)
	for (const change of [
		{ FASTT_DATA_ENV: "production" },
		{ NODE_ENV: "production" },
		{ VERCEL: "1" },
		{ DOCUMENT_PROCESSING_LOCAL_CERTIFICATION: "false" },
		{ DOCUMENT_PROCESSING_APP_ORIGIN: "http://127.0.0.1:4321" },
		{ DOCUMENT_PROCESSING_APP_ORIGIN: "http://example.com:4333" },
	])
		assert.throws(() => dispatcherConfig({ ...env, ...change }))
	assert.equal(
		dispatcherConfig({
			DOCUMENT_PROCESSING_APP_ORIGIN: "https://example.com",
			DOCUMENT_PROCESSING_WORKER_TOKEN: "a".repeat(32),
		}).intervalMs,
		60000
	)
})

test("allows the authorized local portal only with development storage and explicit activation", () => {
	const env = {
		DOCUMENT_PROCESSING_APP_ORIGIN: "http://localhost:4321",
		DOCUMENT_PROCESSING_WORKER_TOKEN: "a".repeat(32),
		FASTT_DOCUMENT_LOCAL_PORTAL_ENABLED: "true",
		FASTT_DOCUMENT_PIPELINE_ENABLED: "true",
		R2_DOCUMENTS_BUCKET_NAME: "documents-development",
		NODE_ENV: "development",
	}
	assert.equal(dispatcherConfig(env).intervalMs, 10000)
	for (const change of [
		{ NODE_ENV: "production" },
		{ VERCEL: "1" },
		{ FASTT_DOCUMENT_LOCAL_PORTAL_ENABLED: "false" },
		{ FASTT_DOCUMENT_PIPELINE_ENABLED: "false" },
		{ R2_DOCUMENTS_BUCKET_NAME: "documents-production" },
		{ DOCUMENT_PROCESSING_APP_ORIGIN: "http://example.com:4321" },
		{ DOCUMENT_PROCESSING_APP_ORIGIN: "http://localhost:4322" },
	])
		assert.throws(() => dispatcherConfig({ ...env, ...change }))
})
