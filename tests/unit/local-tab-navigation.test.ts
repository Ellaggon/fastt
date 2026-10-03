import { describe, expect, it } from "vitest"
import { rememberTabInDestination, sameLocalTabContext } from "@/lib/ui/local-tab-navigation"

const url = (query: string) => new URL(`https://fastt.test/provider/settings/verification?${query}`)
const navigation = ["tab", "tourTab", "lodgingTab", "result", "error"]

describe("local tab context", () => {
	it("changes section without changing the edited object", () => {
		expect(
			sameLocalTabContext(
				url("line=tour&experience=a&tab=identity"),
				url("tab=safety&experience=a&line=tour&tourTab=safety"),
				navigation
			)
		).toBe(true)
	})
	it.each([
		"line=lodging&experience=a",
		"line=tour&experience=b",
		"line=tour&experience=a&type=insurance",
		"line=tour&experience=a&returnTo=%2Fdashboard",
	])("requires server navigation for a different context: %s", (query) => {
		expect(sameLocalTabContext(url("line=tour&experience=a"), url(query), navigation)).toBe(false)
	})
	it("remembers Safety across a business switch while keeping the lodging destination", () => {
		const target = rememberTabInDestination(
			url("line=lodging&tab=fiscal&tourTab=identity&experience=a"),
			url("line=tour&tab=safety&lodgingTab=fiscal")
		)
		expect(Object.fromEntries(target.searchParams)).toMatchObject({
			line: "lodging",
			tab: "fiscal",
			tourTab: "safety",
			experience: "a",
		})
	})
	it("preserves an explicit destination over the other business's remembered tab", () => {
		const target = rememberTabInDestination(
			url("line=lodging&tab=business"),
			url("line=tour&tab=safety&lodgingTab=fiscal")
		)
		expect(Object.fromEntries(target.searchParams)).toMatchObject({
			tab: "business",
			lodgingTab: "business",
			tourTab: "safety",
		})
	})
	it("keeps fiscal submissions pointed at Fiscal", () => {
		const target = rememberTabInDestination(
			url("line=tour&tab=fiscal&tourTab=identity"),
			url("line=tour&tab=safety&lodgingTab=business")
		)
		expect(Object.fromEntries(target.searchParams)).toMatchObject({
			tab: "fiscal",
			tourTab: "fiscal",
			lodgingTab: "business",
		})
	})
})
