import { describe, expect, it } from "vitest"
import { compareComplianceSnapshots } from "@/lib/commercial-policy/migration-integrity"

describe("migration preservation gate", () => {
	const before = { ProviderDocument: { count: 2, sha256: "original" } }
	it("accepts identical inventories", () =>
		expect(compareComplianceSnapshots(before, structuredClone(before))).toEqual([]))
	it("detects a changed decision even when counts are equal", () =>
		expect(
			compareComplianceSnapshots(before, { ProviderDocument: { count: 2, sha256: "changed" } })
		).toEqual(["ProviderDocument"]))
	it("detects missing and newly introduced tables", () => {
		expect(compareComplianceSnapshots(before, {})).toEqual(["ProviderDocument"])
		expect(compareComplianceSnapshots({}, before)).toEqual(["ProviderDocument"])
	})
})
