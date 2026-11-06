import { afterEach, expect, test, vi } from "vitest"

vi.mock("@astrojs/vercel", () => ({ default: () => ({ name: "vercel-test" }) }))
vi.mock("@astrojs/netlify", () => ({ default: () => ({ name: "netlify-test" }) }))
vi.mock("@astrojs/node", () => ({ default: () => ({ name: "node-test" }) }))
vi.mock("dotenv", () => ({ default: { config: () => ({}) } }))

afterEach(() => {
	vi.unstubAllEnvs()
	vi.resetModules()
})

test.each([
	["1", "", "vercel-test"],
	["", "true", "netlify-test"],
	["", "", "node-test"],
])("selects exactly the requested host", async (vercel, netlify, expected) => {
	vi.stubEnv("VERCEL", vercel)
	vi.stubEnv("NETLIFY", netlify)
	vi.stubEnv("URL", "https://evaluation.netlify.app")
	const { default: config } = await import("../../astro.config.mjs")
	expect(config.adapter.name).toBe(expected)
	expect(config.output).toBe("server")
	expect(config.site).toBe(
		netlify ? "https://evaluation.netlify.app" : "https://fastt-five.vercel.app"
	)
})

test("rejects ambiguous build flags instead of silently changing host", async () => {
	vi.stubEnv("VERCEL", "1")
	vi.stubEnv("NETLIFY", "true")
	await expect(import("../../astro.config.mjs")).rejects.toThrow(
		"Select only one deployment platform"
	)
})
