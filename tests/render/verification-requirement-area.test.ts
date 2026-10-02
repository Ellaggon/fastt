import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Sections from "@/components/provider/ProviderVerificationLineSections.astro"
import { buildVerificationScreenSections } from "@/lib/verification/screen-sections"

it("places a synthetic safety licence and its correction link in Safety only", async () => {
	const screen = buildVerificationScreenSections({
		lines: ["tour"],
		collectionModel: "property_collect",
		legalNameComplete: true,
		accountStatus: "approved",
		fiscalStatus: "verified",
		paymentsState: "not_started",
		documents: [],
		slots: [],
		requirements: [
			{
				id: "test.safety-permit",
				layer: "tour",
				presentationArea: "safety",
				label: "Respaldo de seguridad de prueba",
				documentType: "operating_license",
				uploadValue: "operating_license::test.safety-permit",
				accountDocuments: false,
				appliesBecause: "Test only",
				scopes: { productIds: ["a"], resourceIds: [], territoryCodes: [], activityClasses: [] },
			},
		],
	})
	const container = await AstroContainer.create()
	const safety = await container.renderToString(Sections, {
		props: { screen, line: "tour", tourArea: "safety", experienceId: "a" },
	})
	const activity = await container.renderToString(Sections, {
		props: { screen, line: "tour", tourArea: "activity", experienceId: "a" },
	})
	expect(safety).toContain("Respaldo de seguridad de prueba")
	expect(safety).toContain('href="#tour-evidence-tour-safety"')
	expect(activity).not.toContain("Respaldo de seguridad de prueba")
})
