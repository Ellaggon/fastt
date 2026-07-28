import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import {
	PROVIDER_INTEGRATION_CATALOG_CACHE,
	buildChannelManagerCatalogCache,
	isProviderIntegrationCatalogCacheStale,
} from "@/lib/provider-integrations"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
			walkTsFiles(path, out)
			continue
		}
		if (/\.(ts|tsx|astro)$/.test(entry.name)) out.push(path)
	}
	return out
}

describe("Phase 6: catalogJson is smoke cache, mappings are SoT", () => {
	it("documents conceptual size and TTL limits", () => {
		expect(PROVIDER_INTEGRATION_CATALOG_CACHE.maxBytes).toBe(32 * 1024)
		expect(PROVIDER_INTEGRATION_CATALOG_CACHE.ttlMs).toBe(7 * 24 * 60 * 60 * 1000)

		const taxonomy = read("docs/engineering/provider-settings-table-taxonomy.md")
		expect(taxonomy).toContain("Phase 6 — `catalogJson` smoke/preview cache")
		expect(taxonomy).toContain("32 KiB")
		expect(taxonomy).toContain("7 days")
		expect(taxonomy).toContain("ProviderIntegrationRemoteEntity")
		expect(taxonomy).toContain("ProviderIntegrationMapping")
		expect(taxonomy).toContain("Treating `catalogJson` as mapping/catalog SoT")
	})

	it("builds a capped smoke payload without room/rate catalogs", () => {
		const cache = buildChannelManagerCatalogCache({
			vendorKey: "cloudbeds",
			authType: "api_key",
			externalPropertyId: "prop_1",
			lastSmokeProbe: "https_get",
			lastSmokeMessage: "ok",
		})
		expect(cache).toMatchObject({
			vendorKey: "cloudbeds",
			authType: "api_key",
			externalPropertyId: "prop_1",
			lastSmokeProbe: "https_get",
		})
		expect(JSON.stringify(cache).length).toBeLessThanOrEqual(
			PROVIDER_INTEGRATION_CATALOG_CACHE.maxBytes
		)
		expect(Object.keys(cache).sort()).toEqual(
			[
				"authType",
				"externalPropertyId",
				"lastSmokeMessage",
				"lastSmokeProbe",
				"note",
				"vendorKey",
			].sort()
		)
	})

	it("treats missing or old lastCatalogSyncAt as stale preview", () => {
		expect(isProviderIntegrationCatalogCacheStale(null)).toBe(true)
		const now = new Date("2026-07-27T12:00:00.000Z")
		expect(
			isProviderIntegrationCatalogCacheStale(new Date("2026-07-27T11:00:00.000Z"), now)
		).toBe(false)
		expect(
			isProviderIntegrationCatalogCacheStale(new Date("2026-07-01T12:00:00.000Z"), now)
		).toBe(true)
	})

	it("mapping catalog APIs read ProviderIntegrationMapping, not catalogJson", () => {
		const ops = read("src/lib/provider-integration-operations.ts")
		expect(ops).toContain("from(ProviderIntegrationMapping)")
		expect(ops).toContain("listProviderIntegrationMappingCatalog")
		expect(ops).toContain("upsertProviderIntegrationMapping")
		expect(ops).not.toMatch(/catalogJson/)
		expect(ops).not.toMatch(/lastCatalogSyncAt/)

		const domain = read("src/lib/provider-integrations.ts")
		expect(domain).toContain("buildChannelManagerCatalogCache")
		expect(domain).toContain("PROVIDER_INTEGRATION_CATALOG_CACHE")
		// Catalog cache writer must not seed mapping upserts from opaque JSON.
		expect(domain).not.toMatch(/upsertProviderIntegrationMapping\s*\(/)
		expect(domain).not.toMatch(/JSON\.parse\([\s\S]{0,80}catalogJson/)
	})

	it("does not introduce ProviderIntegrationRemoteEntity anywhere in src/", () => {
		const srcRoot = fileURLToPath(new URL("../../src", import.meta.url))
		const hits = walkTsFiles(srcRoot).filter((file) =>
			readFileSync(file, "utf8").includes("ProviderIntegrationRemoteEntity")
		)
		expect(hits).toEqual([])
	})
})
