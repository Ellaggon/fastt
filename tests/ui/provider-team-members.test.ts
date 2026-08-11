import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { resolveProviderPermissions } from "@/lib/provider-permissions"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("provider team member management", () => {
	it("keeps financial and compliance controls exclusive to the owner by default", () => {
		expect(resolveProviderPermissions({ role: "admin" })).toMatchObject({
			canEditProfile: true,
			canManageIntegrations: true,
			canManageFiscality: false,
			canManagePayments: false,
			canManageDocuments: false,
			canInviteTeam: false,
		})
	})

	it("gates role changes and removal on owner access and records both actions", () => {
		const endpoint = read("src/pages/api/provider/settings/team-members.ts")
		const page = read("src/pages/provider/settings/team.astro")
		const summary = read("src/lib/provider-settings-summary.ts")

		expect(endpoint).toContain('provider.role !== "owner"')
		expect(endpoint).toContain('action: z.literal("update_role")')
		expect(endpoint).toContain('action: z.literal("remove")')
		expect(endpoint).toContain("self_protected")
		expect(endpoint).toContain("owner_protected")
		expect(endpoint).toContain("last_owner_protected")
		expect(endpoint).toContain('mutation.action === "update_role" && targetRole === "owner"')
		expect(endpoint).toContain("provider.team_member.role_updated")
		expect(endpoint).toContain("provider.team_member.removed")
		expect(page).toContain("canInviteTeam ? pendingInvitations : []")
		expect(page).toContain("const ownerCount = users.filter")
		expect(page).toContain("/api/provider/settings/team-members")
		expect(page).toContain('action="/api/provider/settings/invitations" data-astro-reload')
		expect(page).toContain('action="/api/provider/settings/team-members" data-astro-reload')
		expect(page).toContain("Copiar enlace de aceptación")
		expect(summary).toContain("governance.permissions.canInviteTeam")
		expect(summary).toContain("Acceptance links are bearer credentials")
	})
})
