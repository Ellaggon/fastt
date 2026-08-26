import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("canonical database architecture", () => {
	it("uses Supabase PostgreSQL without Astro DB, libSQL or Turso runtime wiring", () => {
		const activeConfiguration = [
			read("package.json"),
			read("astro.config.mjs"),
			read(".env.example"),
		].join("\n")

		for (const legacy of [
			"@astrojs/db",
			"@libsql/client",
			"ASTRO_DB_REMOTE_URL",
			"ASTRO_DB_APP_TOKEN",
			"TURSO_DATABASE_URL",
			"TURSO_AUTH_TOKEN",
			"turso-to-supabase",
		]) {
			expect(activeConfiguration).not.toContain(legacy)
		}
	})

	it("keeps Astro config as a static object loaded with dotenv, not a Vite factory", () => {
		const config = read("astro.config.mjs")
		expect(config).not.toMatch(/from ["']vite["']/)
		expect(config).toContain('from "dotenv"')
		expect(config).not.toMatch(/defineConfig\(\s*\(/)
		expect(config).toContain("adapter:")
		expect(config).toContain("vercel()")
		expect(config).toContain("standalone")
	})

	it("keeps integration credentials exclusively in the encrypted credential table", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const baseline = read("db/postgres/0001_initial_schema.sql")

		expect(schema).toContain("ProviderIntegrationCredential")
		expect(schema).toContain('endpointUrl: txtOpt("endpointUrl")')
		expect(schema).not.toContain("credentialsRef")
		expect(baseline).toContain('"endpointUrl" text')

		for (const legacy of [
			'"credentialsRef"',
			'"ProviderIntegrationSyncLog"',
			'"ProviderExternalCalendarSyncJob"',
			'"previewJson"',
			'"lastPreviewAt"',
			'"syncLeaseToken"',
			'"syncLeaseUntil"',
		]) {
			expect(baseline).not.toContain(legacy)
		}
	})
})
