import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Context from "@/components/provider/ProviderTourOperatingContext.astro"

async function render(jurisdictionCode: string | null) {
	const container = await AstroContainer.create()
	return container.renderToString(Context, {
		props: {
			productId: "tour-a",
			context: {
				jurisdictionCode,
				operatingRole: "guide",
				activityClassesJson: ["urban_cultural"],
			},
			canEdit: true,
		},
	})
}

describe("tour territory declaration", () => {
	it("restores a recognized code behind a readable selected label", async () => {
		const html = await render("BO-LP")
		expect(html).toMatch(/value="BO-LP"[^>]*selected[^>]*>\s*La Paz, Bolivia/)
		expect(html).not.toContain('placeholder="Ej.: BO-LP"')
		expect(html).not.toContain("Territorio declarado por revisar")
	})
	it("shows historical data without selecting a replacement", async () => {
		const html = await render("LP-legacy")
		expect(html).toContain("Territorio declarado por revisar")
		expect(html).toContain("LP-legacy")
		expect(html).toMatch(/value=""[^>]*selected/)
		expect(html).not.toMatch(/value="BO-LP"[^>]*selected/)
	})
	it("starts empty rather than defaulting a new declaration to La Paz", async () => {
		const html = await render(null)
		expect(html).toMatch(/value=""[^>]*selected/)
		expect(html).toContain("solicita revisión")
	})
})

it("transports remembered lodging tab and a safe contextual return in the form action", async () => {
	const container = await AstroContainer.create()
	const returnTo = "/product/tour-a/preview?variantId=v&ratePlanId=r"
	const url = new URL(
		"https://fastt.test/provider/settings/verification?line=tour&tab=activity&experience=tour-a&lodgingTab=fiscal"
	)
	url.searchParams.set("returnTo", returnTo)
	const html = await container.renderToString(Context, {
		request: new Request(url),
		props: { productId: "tour-a", productName: "Mi experiencia", context: null, canEdit: true },
	})
	const action = html
		.match(/action="([^"]+)"/)?.[1]
		.replaceAll("&amp;", "&")
		.replaceAll("&#38;", "&")
	expect(action).toContain("lodgingTab=fiscal")
	const target = new URL(action!, url)
	expect(target.searchParams.get("lodgingTab")).toBe("fiscal")
	expect(target.searchParams.get("returnTo")).toBe(returnTo)
})

it.each(["guide", "operator", "intermediary"])(
	"restores the existing %s declaration without changing its territory or activities",
	async (role) => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Context, {
			props: {
				productId: "tour-a",
				productName: "Experiencia A",
				canEdit: true,
				context: {
					operatingRole: role,
					jurisdictionCode: "BO-LP",
					activityClassesJson: ["urban_cultural"],
				},
			},
		})
		expect(html).toContain("Experiencia A")
		expect(html).toMatch(new RegExp(`value="${role}"[^>]*selected`))
		expect(html).toMatch(/value="BO-LP"[^>]*selected/)
		expect(html).toMatch(/value="urban_cultural"[^>]*checked/)
	}
)
