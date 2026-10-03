import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import PaymentsEntry from "@/pages/provider/settings/verification/payments.astro"
import FiscalEntry from "@/pages/provider/settings/verification/fiscal.astro"
import PendingDocument from "@/components/provider/ProviderKycSlotPendingReview.astro"
import { buildRequiredKycSlots } from "@/lib/provider-documents"
import Nav from "@/components/provider/ProviderVerificationBusinessNav.astro"
import { resolveVerificationNavigation } from "@/lib/verification/navigation"

it("keeps an invalid explicit experience empty and provides a recovery selection", async () => {
	const url = new URL(
		"https://fastt.test/provider/settings/verification?line=tour&tab=activity&experience=foreign&returnTo=%2Fproduct%2Fa%2Fpreview"
	)
	const navigation = resolveVerificationNavigation({
		url,
		lines: ["tour"],
		experienceIds: ["mine"],
		fasttCollects: false,
	})
	const container = await AstroContainer.create()
	const html = await container.renderToString(Nav, {
		props: { url, navigation, products: [{ id: "mine", name: "Mi tour" }] },
	})
	expect(html).toContain("La experiencia del enlace no está disponible")
	expect(html).toContain("Experiencias para revisar")
	expect(html).not.toContain("data-verification-experience-selector")
	expect(html).toMatch(/Revisar\s+actividad y licencias/)
	expect(html).toContain("returnTo=%2Fproduct%2Fa%2Fpreview")
})

for (const tab of ["identity", "fiscal", "activity", "safety"] as const) {
	it(`shows experience controls only in scoped areas: ${tab}`, async () => {
		const url = new URL(
			`https://fastt.test/provider/settings/verification?line=tour&tab=${tab}&experience=a&returnTo=%2Fproduct%2Fa%2Fpreview`
		)
		const navigation = resolveVerificationNavigation({
			url,
			lines: ["tour"],
			experienceIds: ["a", "b"],
			fasttCollects: false,
		})
		const container = await AstroContainer.create()
		const html = await container.renderToString(Nav, {
			props: {
				url,
				navigation,
				playbook: [
					{
						id: tab,
						label: tab,
						href: url.pathname + url.search,
						uiState: "action_needed",
						stateLabel: "Completar",
					},
				],
				products: [
					{ id: "a", name: "Tour A" },
					{ id: "b", name: "Tour B" },
				],
			},
		})
		if (tab === "identity" || tab === "fiscal") {
			expect(html).toContain("data-verification-experience-selector")
			expect(html).toMatch(/data-verification-experience-context[^>]*hidden/)
			expect(html).not.toContain("data-verification-shared-scope")
			expect(html).not.toContain("Volver a la experiencia")
		} else {
			expect(html.indexOf("data-verification-tab-nav")).toBeLessThan(
				html.indexOf("data-verification-experience-context")
			)
			expect(html).toContain("Experiencia que estás revisando")
			expect(html).toContain("Cambiar experiencia")
			expect(html).toContain('name="returnTo" value="/product/a/preview"')
		}
	})
}

it("does not render an offer return in the general navigation", async () => {
	const origin = "/rates/plans/a?productId=p&variantId=v&ratePlanId=a"
	const url = new URL(
		"https://fastt.test/provider/settings/verification?line=tour&tab=activity&experience=p&returnTo=" +
			encodeURIComponent(origin)
	)
	const navigation = resolveVerificationNavigation({
		url,
		lines: ["tour"],
		experienceIds: ["p"],
		fasttCollects: false,
	})
	const container = await AstroContainer.create()
	const html = await container.renderToString(Nav, {
		props: { url, navigation, products: [{ id: "p", name: "Tour P" }] },
	})
	expect(html).not.toContain("Volver a la tarifa")
	expect(html).not.toContain('href="/rates/plans/a?')
})

it("legacy fiscal page redirects to the single workspace without loading another header", async () => {
	const url = new URL(
		"https://fastt.test/provider/settings/verification/fiscal?line=tour&tab=identity&experience=p&tourTab=safety&lodgingTab=business&result=tax_profile_saved&returnTo=%2Fproduct%2Fp%2Fpreview"
	)
	const container = await AstroContainer.create()
	const response = await container.renderToResponse(FiscalEntry, { request: new Request(url) })
	expect(response.status).toBe(302)
	const target = new URL(response.headers.get("location")!, url)
	expect(target.pathname).toBe("/provider/settings/verification")
	expect(Object.fromEntries(target.searchParams)).toMatchObject({
		line: "tour",
		tab: "fiscal",
		tourTab: "fiscal",
		lodgingTab: "business",
		experience: "p",
		result: "tax_profile_saved",
		returnTo: "/product/p/preview",
	})
})

for (const line of ["tour", "lodging"] as const) {
	for (const compact of [true, false]) {
		it(`pending document fiscal link preserves context for ${line}, compact=${compact}`, async () => {
			const request = new Request(
				`https://fastt.test/provider/settings/verification?line=${line}&tab=identity&experience=p&tourTab=safety&lodgingTab=business&result=submitted&returnTo=%2Fproduct%2Fp%2Fpreview`
			)
			const slot = {
				...buildRequiredKycSlots({ documents: [], types: ["government_id"] })[0],
				state: "pending",
				stateLabel: "Enviado",
				fileName: "identity.pdf",
			}
			const container = await AstroContainer.create()
			const html = await container.renderToString(PendingDocument, {
				request,
				props: { kycSlot: slot, compact },
			})
			const decoded = html.replaceAll("&#38;", "&").replaceAll("&amp;", "&")
			const href = decoded.match(/href="([^"]+)"/)?.[1]
			const target = new URL(href!, request.url)
			expect(target.pathname).toBe("/provider/settings/verification")
			expect(Object.fromEntries(target.searchParams)).toMatchObject({
				line,
				tab: "fiscal",
				experience: "p",
				returnTo: "/product/p/preview",
				[`${line}Tab`]: "fiscal",
				[line === "tour" ? "lodgingTab" : "tourTab"]: line === "tour" ? "business" : "safety",
			})
			expect(target.searchParams.has("result")).toBe(false)
		})
	}
}

it.each(["tour", "lodging"] as const)(
	"legacy payments entry uses the canonical workspace for %s",
	async (line) => {
		const url = new URL(
			`https://fastt.test/provider/settings/verification/payments?line=${line}&tab=identity&experience=p&tourTab=safety&lodgingTab=business&result=payment_account_created&returnTo=%2Fproduct%2Fp%2Fpreview`
		)
		const container = await AstroContainer.create()
		const response = await container.renderToResponse(PaymentsEntry, { request: new Request(url) })
		expect(response.status).toBe(302)
		const target = new URL(response.headers.get("location")!, url)
		expect(target.pathname).toBe("/provider/settings/verification")
		expect(Object.fromEntries(target.searchParams)).toMatchObject({
			line,
			tab: "payments",
			experience: "p",
			returnTo: "/product/p/preview",
			result: "payment_account_created",
			[`${line}Tab`]: "payments",
		})
		const navigation = resolveVerificationNavigation({
			url: target,
			lines: [line],
			experienceIds: ["p"],
			fasttCollects: false,
		})
		expect(navigation.tab).toBe(line === "tour" ? "identity" : "payments")
		if (line === "tour") expect(navigation.tabs).not.toContain("payments")
		expect(await response.text()).not.toContain("Gestiona la cuenta de cobro")
	}
)
