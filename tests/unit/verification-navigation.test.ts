import { describe, expect, it } from "vitest"
import {
	buildTourVerificationPlaybook,
	copyVerificationNavigationQuery,
	resolveVerificationNavigation,
	resolveVerificationExperience,
	summarizeVerificationPlaybook,
	verificationNavigationHref,
	verificationTabsFor,
} from "@/lib/verification/navigation"

const base = "https://fastt.test/provider/settings/verification"

describe("verification navigation by business line", () => {
	it("keeps four lodging tabs and gives tours their own conditional tabs", () => {
		expect(verificationTabsFor("lodging", false)).toEqual([
			"identity",
			"business",
			"fiscal",
			"payments",
		])
		expect(verificationTabsFor("tour", false)).toEqual(["identity", "activity", "safety", "fiscal"])
		expect(verificationTabsFor("tour", true)).toEqual([
			"identity",
			"activity",
			"safety",
			"fiscal",
			"payments",
		])
	})

	it("preserves each line's last tab and the selected experience when switching", () => {
		const url = new URL(`${base}?line=tour&tab=safety&experience=tour-2&lodgingTab=business`)
		const tour = resolveVerificationNavigation({
			url,
			lines: ["lodging", "tour"],
			experienceIds: ["tour-1", "tour-2"],
			fasttCollects: false,
		})
		expect(tour).toMatchObject({ line: "tour", tab: "safety", experienceId: "tour-2" })
		const lodgingHref = verificationNavigationHref({ url, navigation: tour, line: "lodging" })
		const lodgingUrl = new URL(lodgingHref, base)
		expect(lodgingUrl.searchParams.get("tab")).toBe("business")
		expect(lodgingUrl.searchParams.get("tourTab")).toBe("safety")
		expect(lodgingUrl.searchParams.get("experience")).toBe("tour-2")
		const lodging = resolveVerificationNavigation({
			url: lodgingUrl,
			lines: ["lodging", "tour"],
			experienceIds: ["tour-1", "tour-2"],
			fasttCollects: false,
		})
		const returnUrl = new URL(
			verificationNavigationHref({ url: lodgingUrl, navigation: lodging, line: "tour" }),
			base
		)
		expect(returnUrl.searchParams.get("tab")).toBe("safety")
		expect(returnUrl.searchParams.get("experience")).toBe("tour-2")
	})

	it("rejects a foreign experience and an unavailable business line", () => {
		const url = new URL(`${base}?line=tour&tab=payments&experience=foreign`)
		expect(
			resolveVerificationNavigation({
				url,
				lines: ["tour"],
				experienceIds: ["mine"],
				fasttCollects: false,
			})
		).toMatchObject({ line: "tour", tab: "identity", experienceId: null })
		expect(
			resolveVerificationNavigation({
				url,
				lines: ["lodging"],
				experienceIds: [],
				fasttCollects: false,
			})
		).toMatchObject({ line: "lodging", tab: "payments", experienceId: null })
	})

	it("routes old fiscal and business links into the selected line", () => {
		const fiscal = resolveVerificationNavigation({
			url: new URL(`${base}/fiscal`),
			lines: ["tour"],
			experienceIds: [],
			fasttCollects: false,
		})
		expect(fiscal.tab).toBe("fiscal")
		const identity = resolveVerificationNavigation({
			url: new URL(`${base}?type=government_id`),
			lines: ["tour"],
			experienceIds: [],
			fasttCollects: false,
		})
		expect(identity.tab).toBe("identity")
		const business = resolveVerificationNavigation({
			url: new URL(`${base}?type=business_registration`),
			lines: ["tour"],
			experienceIds: [],
			fasttCollects: false,
		})
		expect(business.tab).toBe("activity")
	})

	it("retains line, tab and experience through a form redirect without copying unrelated input", () => {
		const source = new URL(`${base}?line=tour&tab=activity&experience=tour-2&result=forged`)
		const redirect = copyVerificationNavigationQuery(new URL(`${base}?result=submitted`), source)
		expect(redirect.searchParams.get("line")).toBe("tour")
		expect(redirect.searchParams.get("tab")).toBe("activity")
		expect(redirect.searchParams.get("experience")).toBe("tour-2")
		expect(redirect.searchParams.get("result")).toBe("submitted")
	})

	it("shows identity as En revisión when the playbook passes in_review for holder changes", () => {
		const tabs = buildTourVerificationPlaybook({
			tabs: ["identity", "activity", "safety", "fiscal"],
			hrefFor: (tab) => `/provider/settings/verification?line=tour&tab=${tab}`,
			identity: "in_review",
			registration: "action_needed",
			fiscal: "not_started",
			payments: "not_started",
			activity: ["not_started"],
			safety: [],
			contextComplete: false,
		})
		expect(tabs.find((tab) => tab.id === "identity")?.stateLabel).toBe("En revisión")
	})

	it("shows identity as Completar when the ID slot is missing even if registration is in review", () => {
		const tabs = buildTourVerificationPlaybook({
			tabs: ["identity", "activity", "safety", "fiscal"],
			hrefFor: (tab) => `/provider/settings/verification?line=tour&tab=${tab}`,
			identity: "action_needed",
			registration: "in_review",
			fiscal: "not_started",
			payments: "not_started",
			activity: ["not_started"],
			safety: [],
			contextComplete: false,
		})
		expect(tabs.find((tab) => tab.id === "identity")?.stateLabel).toBe("Completar")
	})

	it("does not present safety as ready before the tour context can be evaluated", () => {
		const tabs = buildTourVerificationPlaybook({
			tabs: ["identity", "activity", "safety", "fiscal"],
			hrefFor: (tab) => `/provider/settings/verification?line=tour&tab=${tab}`,
			identity: "ready",
			registration: null,
			fiscal: "in_review",
			payments: "not_started",
			activity: ["not_started"],
			safety: [],
			contextComplete: false,
		})
		expect(tabs.map((tab) => [tab.id, tab.stateLabel])).toEqual([
			["identity", "Listo"],
			["activity", "Completar"],
			["safety", "No evaluable"],
			["fiscal", "En revisión"],
		])
		expect(summarizeVerificationPlaybook(tabs)).toMatchObject({
			readyCount: 1,
			totalCount: 4,
			inReviewCount: 1,
			actionRequiredCount: 1,
			notStartedCount: 0,
			notEvaluableCount: 1,
		})
	})

	it("excludes non-applicable safety from the denominator after context is complete", () => {
		const tabs = buildTourVerificationPlaybook({
			tabs: ["identity", "activity", "safety", "fiscal"],
			hrefFor: (tab) => `/verification?tab=${tab}`,
			identity: "ready",
			registration: null,
			fiscal: "ready",
			payments: "not_started",
			activity: ["ready"],
			safety: [],
			contextComplete: true,
		})
		expect(tabs.find((tab) => tab.id === "safety")?.stateLabel).toBe("No aplica")
		expect(summarizeVerificationPlaybook(tabs)).toMatchObject({
			readyCount: 3,
			totalCount: 3,
			readinessPercent: 100,
		})
	})

	it("keeps safety unevaluable while its commercial policy is unresolved", () => {
		const tabs = buildTourVerificationPlaybook({
			tabs: ["activity", "safety"],
			hrefFor: (tab) => `/verification?tab=${tab}`,
			identity: "ready",
			registration: null,
			fiscal: "ready",
			payments: "not_started",
			activity: ["ready"],
			safety: [],
			contextComplete: true,
			policyResolved: false,
		})
		expect(tabs.find((tab) => tab.id === "safety")?.stateLabel).toBe("No evaluable")
		expect(summarizeVerificationPlaybook(tabs)).toMatchObject({
			readyCount: 1,
			totalCount: 2,
			notEvaluableCount: 1,
			readinessPercent: 50,
		})
	})
})

describe("experience selection intent", () => {
	it("rejects stale and empty explicit selections even with a single available tour", () => {
		expect(resolveVerificationExperience("foreign", ["mine"])).toBeNull()
		expect(resolveVerificationExperience("", ["mine"])).toBeNull()
	})
	it("requires selection for multiple tours and only defaults an unambiguous absent selection", () => {
		expect(resolveVerificationExperience(null, ["a", "b"])).toBeNull()
		expect(resolveVerificationExperience(null, ["a"])).toBe("a")
		expect(resolveVerificationExperience("b", ["a", "b"])).toBe("b")
		expect(resolveVerificationExperience(null, [])).toBeNull()
	})
})

it("preserves an allowed return while switching business lines and rejects external destinations", () => {
	const url = new URL(
		`${base}?line=tour&tab=activity&experience=a&lodgingTab=fiscal&returnTo=${encodeURIComponent("/product/a/preview?variantId=v&ratePlanId=r")}`
	)
	const navigation = resolveVerificationNavigation({
		url,
		lines: ["tour", "lodging"],
		experienceIds: ["a"],
		fasttCollects: false,
	})
	const switched = new URL(verificationNavigationHref({ url, navigation, line: "lodging" }), base)
	expect(switched.searchParams.get("returnTo")).toBe("/product/a/preview?variantId=v&ratePlanId=r")
	url.searchParams.set("returnTo", "https://malicious.test/")
	expect(copyVerificationNavigationQuery(new URL(base), url).searchParams.has("returnTo")).toBe(
		false
	)
})
