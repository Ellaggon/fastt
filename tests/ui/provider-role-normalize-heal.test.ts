import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	formatProviderRoleLabel,
	normalizeProviderRole,
	resolveHealedProviderRole,
	resolveProviderPermissions,
} from "@/lib/provider-permissions"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("P0 provider role normalize + heal", () => {
	it("normalizes case/whitespace and maps unknown to staff", () => {
		expect(normalizeProviderRole("owner")).toBe("owner")
		expect(normalizeProviderRole("Owner")).toBe("owner")
		expect(normalizeProviderRole(" OWNER ")).toBe("owner")
		expect(normalizeProviderRole("Admin")).toBe("admin")
		expect(normalizeProviderRole("STAFF")).toBe("staff")
		expect(normalizeProviderRole("")).toBe("staff")
		expect(normalizeProviderRole("superuser")).toBe("staff")
		expect(normalizeProviderRole(null)).toBe("staff")
		expect(formatProviderRoleLabel("Owner")).toBe("Propietario")
	})

	it("keeps owner document permissions even if permissionsJson strips them", () => {
		const permissions = resolveProviderPermissions({
			role: "Owner",
			permissionsJson: {
				canManageDocuments: false,
				canEditProfile: false,
				canInviteTeam: false,
			},
		})
		expect(permissions.canManageDocuments).toBe(true)
		expect(permissions.canEditProfile).toBe(true)
		expect(permissions.canInviteTeam).toBe(true)
	})

	it("promotes sole member / no-owner staff to owner", () => {
		expect(
			resolveHealedProviderRole({
				currentRole: "staff",
				memberRoles: ["staff"],
			})
		).toMatchObject({
			role: "owner",
			shouldPromoteToOwner: true,
			reason: "provider_has_no_owner",
		})

		expect(
			resolveHealedProviderRole({
				currentRole: "staff",
				memberRoles: ["staff", "admin"],
			})
		).toMatchObject({
			role: "owner",
			shouldPromoteToOwner: true,
			reason: "provider_has_no_owner",
		})

		expect(
			resolveHealedProviderRole({
				currentRole: "staff",
				memberRoles: ["owner", "staff"],
			})
		).toMatchObject({
			role: "staff",
			shouldPromoteToOwner: false,
		})

		expect(
			resolveHealedProviderRole({
				currentRole: "admin",
				memberRoles: ["admin"],
			})
		).toMatchObject({
			role: "admin",
			shouldPromoteToOwner: false,
		})
	})

	it("wires session heal + verification uses session permissions", () => {
		const permissions = read("src/lib/provider-permissions.ts")
		const repo = read("src/modules/catalog/infrastructure/repositories/ProviderRepository.ts")
		const session = read("src/lib/auth/providerSessionSurface.ts")
		const page = read("src/pages/provider/settings/verification.astro")
		const cache = read("src/lib/auth/authCache.ts")

		expect(permissions).toContain("export function normalizeProviderRole")
		expect(permissions).toContain("resolveHealedProviderRole")
		expect(permissions).toContain('if (role === "owner")')
		expect(permissions).toContain("merged.canManageDocuments = true")

		expect(repo).toContain("healProviderUserRoleIfNeeded")
		expect(repo).toContain("await this.healProviderUserRoleIfNeeded(params)")

		expect(session).toContain("healProviderUserRoleIfNeeded")
		expect(session).toContain('cached.role === "owner" || cached.role === "admin"')

		expect(page).toContain("requireProviderSessionSurface")
		expect(page).toContain("sessionPermissions ?? summary?.permissions")
		expect(page).not.toContain("const permissions = summary?.permissions ?? {}")

		const optionals = read("src/pages/provider/settings/verification/documents.astro")
		expect(optionals).toContain("requireProviderSessionSurface")
		expect(optionals).toContain("sessionPermissions ?? summary?.permissions")

		expect(cache).toContain("normalizeProviderRole(raw.role)")
		expect(cache).toContain("resolveProviderPermissions")
	})
})
