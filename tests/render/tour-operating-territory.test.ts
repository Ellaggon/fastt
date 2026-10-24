import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Context from "@/components/provider/ProviderTourOperatingContext.astro"

async function render(
	context: {
		jurisdictionCode: string | null
		jurisdictionCodes?: string[] | null
	} | null
) {
	const container = await AstroContainer.create()
	return container.renderToString(Context, {
		props: {
			productId: "tour-a",
			context: context && {
				...context,
				operatingRole: "guide",
				activityClassesJson: ["urban_cultural"],
			},
			canEdit: true,
		},
	})
}

describe("tour territory declaration", () => {
	it("restores a recognized code behind a readable selected label", async () => {
		const html = await render({ jurisdictionCode: "BO-LP", jurisdictionCodes: ["BO-LP"] })
		expect(html).toMatch(/name="jurisdictionCodes"[^>]*value="BO-LP"[^>]*checked/)
		expect(html).toContain("La Paz")
		expect(html).not.toContain("Territorio declarado por revisar")
	})
	it("shows historical data without selecting a replacement", async () => {
		const html = await render({ jurisdictionCode: "LP-legacy" })
		expect(html).toContain("Territorio declarado por revisar")
		expect(html).toContain("LP-legacy")
		expect(html).not.toMatch(/name="jurisdictionCodes"[^>]*value="BO-LP"[^>]*checked/)
	})
	it("starts empty rather than defaulting a new declaration to La Paz", async () => {
		const html = await render(null)
		expect(html).not.toMatch(/name="jurisdictionCodes"[^>]*checked/)
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
		props: { productId: "tour-a", context: null, canEdit: true },
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
				canEdit: true,
				context: {
					operatingRole: role,
					jurisdictionCode: "BO-LP",
					jurisdictionCodes: ["BO-LP"],
					activityClassesJson: ["urban_cultural"],
				},
			},
		})
		expect(html).toMatch(new RegExp(`value="${role}"[^>]*selected`))
		expect(html).toMatch(/name="jurisdictionCodes"[^>]*value="BO-LP"[^>]*checked/)
		expect(html).toMatch(/value="urban_cultural"[^>]*checked/)
	}
)
