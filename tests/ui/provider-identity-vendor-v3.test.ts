import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	getIdentityVendorStatus,
	resolveIdentityVendorPreference,
	startIdentityVendorSession,
} from "@/lib/identity-vendor"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

const ENV_KEYS = [
	"IDENTITY_VENDOR_PROVIDER",
	"IDENTITY_VENDOR_LIVE",
	"IDENTITY_VENDOR_API_KEY",
	"IDENTITY_VENDOR_API_URL",
	"IDENTITY_VENDOR_TEMPLATE_ID",
] as const

const originalEnv: Record<string, string | undefined> = {}

function snapshotEnv() {
	for (const key of ENV_KEYS) originalEnv[key] = process.env[key]
}

function restoreEnv() {
	for (const key of ENV_KEYS) {
		if (originalEnv[key] === undefined) delete process.env[key]
		else process.env[key] = originalEnv[key]
	}
}

function clearVendorEnv() {
	for (const key of ENV_KEYS) delete process.env[key]
}

describe("V3 identity vendor (Jumio/Persona scaffold)", () => {
	snapshotEnv()
	afterEach(() => {
		restoreEnv()
	})

	it("defaults to off so V1–V2 manual UX stays the path", () => {
		clearVendorEnv()
		expect(resolveIdentityVendorPreference()).toBe("off")
		const status = getIdentityVendorStatus()
		expect(status.mode).toBe("off")
		expect(status.surfaceEnabled).toBe(false)
		expect(status.selfieLive).toBe(false)
	})

	it("keeps simulated as harness without host selfie surface (P3)", async () => {
		clearVendorEnv()
		process.env.IDENTITY_VENDOR_PROVIDER = "simulated"
		const status = getIdentityVendorStatus()
		expect(status.mode).toBe("simulated")
		expect(status.surfaceEnabled).toBe(false)
		expect(status.selfieLive).toBe(false)
		expect(status.adminHint).toMatch(/P0|manual|P3/i)

		const session = await startIdentityVendorSession({
			providerId: "prov-1",
			actorUserId: "user-1",
			returnUrl: "https://example.test/verification",
		})
		expect(session.ok).toBe(true)
		expect(session.mode).toBe("simulated")
		expect(session.launchUrl).toBeNull()
		expect(session.hostNarrative).toMatch(/manual/i)
		expect(session.hostNarrative).not.toMatch(/Airbnb/i)
	})

	it("keeps persona/jumio host surface off until LIVE+URL+KEY", () => {
		clearVendorEnv()
		process.env.IDENTITY_VENDOR_PROVIDER = "persona"
		process.env.IDENTITY_VENDOR_API_KEY = "test-key"
		const status = getIdentityVendorStatus()
		expect(status.mode).toBe("scaffold")
		expect(status.surfaceEnabled).toBe(false)
		expect(status.selfieLive).toBe(false)
		expect(status.hostLabel).toMatch(/preparación/i)

		process.env.IDENTITY_VENDOR_LIVE = "1"
		process.env.IDENTITY_VENDOR_API_URL = "https://vendor.example/id"
		const live = getIdentityVendorStatus()
		expect(live.mode).toBe("live")
		expect(live.surfaceEnabled).toBe(true)
		expect(live.selfieLive).toBe(true)
	})

	it("wires optional vendor card + API without forcing it on verification fold", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderIdentityVendorCard.astro")
		const api = read("src/pages/api/provider/settings/identity-vendor.ts")
		const lib = read("src/lib/identity-vendor/index.ts")
		const env = read(".env.example")

		expect(page).toContain("getIdentityVendorStatus")
		expect(page).toContain("ProviderIdentityVendorCard")
		expect(page).toContain("identityVendorStatus.selfieLive")
		expect(page).toContain("canManageDocuments")

		expect(card).toContain("data-identity-vendor-card")
		expect(card).toContain("data-identity-vendor-honesty")
		expect(card).toContain("data-identity-vendor-p0-guard")
		expect(card).toContain("data-identity-vendor-manual-cta")
		expect(card).toContain("data-identity-vendor-selfie-live")
		expect(card).toContain("No sustituye el permiso de Documentos")
		expect(card).toContain("Subir documento manualmente")

		expect(api).toContain("startIdentityVendorSession")
		expect(api).toContain("getIdentityVendorStatus")
		expect(api).toContain("canManageDocuments")
		expect(api).toContain("identity_vendor_not_live")
		expect(api).toContain("forbidden_documents")

		expect(lib).toContain("IDENTITY_VENDOR_LIVE")
		expect(lib).toContain("persona")
		expect(lib).toContain("jumio")
		expect(lib).toContain("never enable by key alone")
		expect(lib).toContain("selfieLive")
		expect(lib).toContain("Never substitutes P0")

		expect(env).toContain("IDENTITY_VENDOR_PROVIDER=off")
		expect(env).toContain("IDENTITY_VENDOR_LIVE=1")
		expect(env).toContain("Host selfie card ONLY when LIVE")
	})
})

describe("P3 identity vendor selfie LIVE-only (never substitutes P0)", () => {
	snapshotEnv()
	afterEach(() => {
		restoreEnv()
	})

	it("refuses non-live start for persona without LIVE", async () => {
		clearVendorEnv()
		process.env.IDENTITY_VENDOR_PROVIDER = "persona"
		process.env.IDENTITY_VENDOR_API_KEY = "test-key"
		const session = await startIdentityVendorSession({
			providerId: "prov-1",
			actorUserId: "user-1",
			returnUrl: "https://example.test/verification",
		})
		expect(session.ok).toBe(false)
		expect(session.error).toBe("identity_vendor_not_live")
		expect(session.launchUrl).toBeNull()
		expect(session.hostNarrative).toMatch(/manual/i)
	})

	it("does not expose host selfie UI for scaffold or simulated", () => {
		clearVendorEnv()
		process.env.IDENTITY_VENDOR_PROVIDER = "jumio"
		process.env.IDENTITY_VENDOR_API_KEY = "k"
		expect(getIdentityVendorStatus().surfaceEnabled).toBe(false)

		process.env.IDENTITY_VENDOR_PROVIDER = "simulated"
		expect(getIdentityVendorStatus().surfaceEnabled).toBe(false)
	})
})
