import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	buildProviderInvitationAcceptPath,
	createProviderInvitationToken,
} from "@/lib/provider-invitations"
import { routes } from "@/lib/routes"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-1 invite accept tokenized lifecycle", () => {
	it("builds accept paths from opaque tokens", () => {
		const token = createProviderInvitationToken()
		expect(token.length).toBeGreaterThanOrEqual(32)
		expect(buildProviderInvitationAcceptPath(token)).toBe(
			`${routes.providerInvitationAccept()}?token=${encodeURIComponent(token)}`
		)
	})

	it("wires schema, create/resend token, accept API, and accept page", () => {
		const tables = read("src/shared/infrastructure/db/schema/tables.ts")
		const invitationsApi = read("src/pages/api/provider/settings/invitations.ts")
		const acceptApi = read("src/pages/api/provider/invitations/accept.ts")
		const acceptPage = read("src/pages/provider/invitations/accept.astro")
		const team = read("src/pages/provider/settings/team.astro")
		const summary = read("src/lib/provider-settings-summary.ts")
		const lib = read("src/lib/provider-invitations.ts")
		const routesSrc = read("src/lib/routes.ts")

		expect(tables).toContain('token: txtOpt("token")')
		expect(tables).toContain('uniqueIndex("ProviderInvitation_token_unique")')

		expect(routesSrc).toContain("providerInvitationAccept")
		expect(lib).toContain("acceptProviderInvitation")
		expect(lib).toContain("createProviderInvitationToken")
		expect(lib).toContain("buildProviderInvitationAcceptPath")

		expect(invitationsApi).toContain("createProviderInvitationToken")
		expect(invitationsApi).toContain("buildProviderInvitationAcceptPath")
		expect(invitationsApi).toContain("token,")
		expect(invitationsApi).toContain("acceptPath")
		expect(invitationsApi).toContain("sendProviderInvitationEmail")

		expect(acceptApi).toContain("acceptProviderInvitation")
		expect(acceptApi).toContain("result=joined")
		expect(lib).toContain("email_mismatch")
		expect(acceptPage).toContain("email_mismatch")
		expect(acceptPage).toContain("data-invite-accept-form")
		expect(acceptPage).toContain("data-invite-accept-submit")
		expect(acceptPage).toContain("returnTo=")
		expect(acceptPage).toContain("Aceptar y unirme al equipo")

		expect(summary).toContain("acceptPath:")
		expect(summary).toContain("ensureProviderInvitationToken")
		expect(team).toContain("data-invite-accept-url")
		expect(team).toContain("Copiar enlace de aceptación")
		expect(team).toContain('resultKey === "joined"')
		expect(team).toContain("Te uniste al equipo")
	})
})
