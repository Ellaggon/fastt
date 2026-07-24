import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	formatProviderRoleLabel,
	providerInviteLifecycleSteps,
	providerRoleLabels,
} from "@/lib/provider-permissions"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S2-3 team invite lifecycle + human role labels", () => {
	it("exposes human role labels and invite lifecycle steps", () => {
		expect(providerRoleLabels.admin).toBe("Administrador")
		expect(providerRoleLabels.staff).toBe("Operaciones")
		expect(formatProviderRoleLabel("admin")).toBe("Administrador")
		expect(formatProviderRoleLabel("staff")).toBe("Operaciones")
		expect(formatProviderRoleLabel("owner")).toBe("Propietario")
		expect(providerInviteLifecycleSteps.map((step) => step.label)).toEqual([
			"Invitar",
			"Correo",
			"Aceptar",
			"Acceso",
		])
	})

	it("wires team page to lifecycle copy and never shows raw admin/staff labels", () => {
		const page = read("src/pages/provider/settings/team.astro")
		const permissions = read("src/lib/provider-permissions.ts")
		const summary = read("src/lib/provider-settings-summary.ts")
		const api = read("src/pages/api/provider/settings/invitations.ts")

		expect(page).toContain("providerInviteLifecycleSteps")
		expect(page).toContain("Ciclo de la invitación")
		expect(page).toContain("Invita a tu equipo")
		expect(page).toContain("providerRoleLabels.admin")
		expect(page).toContain("providerRoleLabels.staff")
		expect(page).toContain("Pendiente de aceptación")
		expect(page).not.toContain("Rol: {user.role}")
		expect(page).not.toContain("Rol: {invitation.role}")
		expect(page).toContain("roleLabelFor(user)")
		expect(page).toContain("roleLabelFor(invitation)")
		expect(page).toContain('value="admin"')
		expect(page).toContain('value="staff"')

		expect(permissions).toContain('admin: "Administrador"')
		expect(permissions).toContain('staff: "Operaciones"')
		expect(summary).toContain("roleLabel: formatProviderRoleLabel")
		expect(summary).toContain("Pendiente de aceptación")
		expect(api).toContain("redirectToTeamError")
		expect(api).toContain("duplicate_pending_invitation")
	})
})
