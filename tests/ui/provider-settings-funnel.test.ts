import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

import {
	emitProviderSettingsFunnelEvent,
	emitSettingsFunnelDomainCompletions,
	SETTINGS_FUNNEL_EVENTS,
} from "@/lib/provider-settings-funnel"
import { logger } from "@/lib/observability/logger"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S5-6 settings funnel analytics (blocker→CTA→complete)", () => {
	const prevSink = process.env.SETTINGS_FUNNEL_SINK

	afterEach(() => {
		if (prevSink === undefined) delete process.env.SETTINGS_FUNNEL_SINK
		else process.env.SETTINGS_FUNNEL_SINK = prevSink
		vi.restoreAllMocks()
	})

	it("emits allowlisted funnel events to the log sink", () => {
		process.env.SETTINGS_FUNNEL_SINK = "log"
		const spy = vi.spyOn(logger, "info").mockImplementation(() => {})

		const result = emitProviderSettingsFunnelEvent({
			event: SETTINGS_FUNNEL_EVENTS.blockerShown,
			providerId: "prov_1",
			domain: "payments",
			blockerId: "payments",
			surface: "hub_coach",
		})
		expect(result.ok).toBe(true)
		expect(spy).toHaveBeenCalledWith(
			"provider.settings.funnel.blocker_shown",
			expect.objectContaining({
				providerId: "prov_1",
				domain: "payments",
				blockerId: "payments",
				surface: "hub_coach",
			})
		)
	})

	it("skips when sink is noop and rejects invalid events", () => {
		process.env.SETTINGS_FUNNEL_SINK = "noop"
		const spy = vi.spyOn(logger, "info").mockImplementation(() => {})
		expect(
			emitProviderSettingsFunnelEvent({
				event: SETTINGS_FUNNEL_EVENTS.ctaClicked,
				providerId: "prov_1",
				ctaKind: "primary",
			})
		).toEqual({ ok: true, skipped: true, sink: "noop" })
		expect(spy).not.toHaveBeenCalled()

		expect(
			emitProviderSettingsFunnelEvent({
				event: "provider.settings.funnel.unknown" as any,
				providerId: "prov_1",
			})
		).toEqual({ ok: false, error: "invalid_event" })
	})

	it("emits domain_complete only when readiness flips incomplete→complete", () => {
		process.env.SETTINGS_FUNNEL_SINK = "log"
		const spy = vi.spyOn(logger, "info").mockImplementation(() => {})

		emitSettingsFunnelDomainCompletions({
			providerId: "prov_1",
			previousReadiness: [
				{ id: "identity", complete: true },
				{ id: "payments", complete: false },
			],
			nextReadiness: [
				{ id: "identity", complete: true },
				{ id: "payments", complete: true },
			],
			progressPercent: 50,
			actorUserId: "user_1",
		})

		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenCalledWith(
			"provider.settings.funnel.domain_complete",
			expect.objectContaining({
				providerId: "prov_1",
				domain: "payments",
				progressPercent: 50,
				actorUserId: "user_1",
			})
		)
	})

	it("wires beacon, API, hub attrs, post-save CTAs, and governance persist", () => {
		const helper = read("src/lib/provider-settings-funnel.ts")
		const api = read("src/pages/api/provider/settings/funnel.ts")
		const beacon = read("src/pages/provider/settings/_client/settings-funnel-beacon.js")
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const hub = read("src/pages/provider/settings/index.astro")
		const hydration = read("src/pages/provider/settings/_client/settings-summary-hydration.js")
		const governance = read("src/lib/provider-governance.ts")
		const profile = read("src/pages/provider/settings/profile.astro")
		const verification = read("src/pages/provider/settings/verification.astro")
		const payments = read("src/pages/provider/settings/payments.astro")
		const fiscal = read("src/pages/provider/settings/tax-fees/identity.astro")
		const envExample = read(".env.example")

		expect(helper).toContain("provider.settings.funnel.blocker_shown")
		expect(helper).toContain("provider.settings.funnel.cta_clicked")
		expect(helper).toContain("provider.settings.funnel.domain_complete")
		expect(helper).toContain("provider.settings.funnel.kyc_capture_timing")
		expect(helper).toContain("SETTINGS_FUNNEL_SINK")

		expect(api).toContain("emitProviderSettingsFunnelEvent")
		expect(api).toContain("server_only_event")
		expect(api).toContain("SETTINGS_FUNNEL_EVENTS.domainComplete")

		expect(beacon).toContain("/api/provider/settings/funnel")
		expect(beacon).toContain("blocker_shown")
		expect(beacon).toContain("cta_clicked")
		expect(beacon).toContain("kyc_capture_timing")
		expect(beacon).toContain("bindKycCaptureTiming")
		expect(beacon).toContain("sendBeacon")
		expect(beacon).toContain("settings-summary-hydrated")

		expect(layout).toContain("settings-funnel-beacon.js")
		expect(hub).toContain("data-funnel-blocker-id")
		expect(hub).toContain('data-funnel-cta="primary"')
		expect(hydration).toContain("settings-summary-hydrated")
		expect(hydration).toContain("data-funnel-blocker-id")

		expect(governance).toContain("emitSettingsFunnelDomainCompletions")
		expect(governance).toContain("previousReadiness")

		expect(profile).toContain('data-funnel-domain="identity"')
		expect(verification).toContain('data-funnel-domain="verification"')
		expect(payments).toContain('data-funnel-domain="payments"')
		expect(fiscal).toContain('data-funnel-domain="fiscality"')
		expect(envExample).toContain("SETTINGS_FUNNEL_SINK")
	})
})
