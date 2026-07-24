import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	getSettingsFunnelQueryStatus,
	resolveSettingsFunnelSink,
} from "@/lib/provider-settings-funnel"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P2 Cross settings funnel queryable sink", () => {
	afterEach(() => {
		delete process.env.SETTINGS_FUNNEL_SINK
	})

	it("marks queryable only for db|both", () => {
		process.env.SETTINGS_FUNNEL_SINK = "log"
		expect(resolveSettingsFunnelSink()).toBe("log")
		expect(getSettingsFunnelQueryStatus().queryable).toBe(false)

		process.env.SETTINGS_FUNNEL_SINK = "db"
		expect(getSettingsFunnelQueryStatus().queryable).toBe(true)
		expect(getSettingsFunnelQueryStatus().hostLabel).toMatch(/DB/i)

		process.env.SETTINGS_FUNNEL_SINK = "both"
		expect(getSettingsFunnelQueryStatus().queryable).toBe(true)
	})

	it("wires admin query API, admin panel, CLI, and conversion summary", () => {
		const helper = read("src/lib/provider-settings-funnel.ts")
		const adminApi = read("src/pages/api/admin/providers/settings-funnel.ts")
		const adminPage = read("src/pages/admin/providers.astro")
		const script = read("src/scripts/query-settings-funnel.ts")
		const pkg = read("package.json")
		const envExample = read(".env.example")

		expect(helper).toContain("ctaRatePercent")
		expect(helper).toContain("completeRatePercent")
		expect(helper).toContain("summarizeProviderSettingsFunnelByDomain")
		expect(helper).toContain("getSettingsFunnelQueryStatus")
		expect(helper).toContain('entityType: FUNNEL_ENTITY_TYPE')

		expect(adminApi).toContain("requireInternalAdmin")
		expect(adminApi).toContain("summarizeProviderSettingsFunnel")
		expect(adminApi).toContain("listProviderSettingsFunnelEvents")

		expect(adminPage).toContain("data-admin-settings-funnel")
		expect(adminPage).toContain("data-admin-funnel-summary")
		expect(adminPage).toContain("/api/admin/providers/settings-funnel")

		expect(script).toContain("summarizeProviderSettingsFunnelByDomain")
		expect(pkg).toContain("query:settings-funnel")
		expect(envExample).toContain("SETTINGS_FUNNEL_SINK=db")
		expect(envExample).toContain("/api/admin/providers/settings-funnel")
	})
})
