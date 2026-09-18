import { describe, expect, it } from "vitest"
import { POST as providerIdentityPost } from "@/pages/api/providers"
import { POST as providerIdentityUpdatePost } from "@/pages/api/providers/[id]"
import { POST as providerProfilePost } from "@/pages/api/providers/profile"
import { POST as productCreatePost } from "@/pages/api/product/create"
import { POST as productPublishPost } from "@/pages/api/product/publish"
import { POST as preparationSessionPost } from "@/pages/api/onboarding/preparation-session"
import { GET as commercialPolicyGet } from "@/pages/api/onboarding/commercial-policy"
import { listActivePreparationSessions } from "@/lib/onboarding/preparationSession"
import {
	db,
	eq,
	Product,
	Provider,
	ProviderHolderProfile,
	ProviderPreparationSession,
	ProviderProfile,
} from "@/shared/infrastructure/db/compat"
import { upsertGeoPlace } from "../test-support/catalog-db-test-data"
import { withSupabaseAuthStub } from "../test-support/supabase-auth-stub"

const run = crypto.randomUUID()

function authedFormRequest(params: {
	path: string
	token: string
	form: FormData
	accept?: "application/json" | "text/html"
}): Request {
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers: {
			accept: params.accept ?? "application/json",
			cookie: `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=fixture`,
		},
		body: params.form,
	})
}

function authedJsonRequest(params: { path: string; token: string; body: unknown }): Request {
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"cookie": `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=fixture`,
		},
		body: JSON.stringify(params.body),
	})
}

describe("e2e/authenticated provider onboarding", () => {
	it("persists hotel and tour drafts across an authenticated provider resume without duplicating products", async () => {
		const token = `onboarding-token-${run}`
		const resumedToken = `onboarding-resumed-token-${run}`
		const email = `onboarding-${run}@example.test`
		const userId = `user_${run}`
		const authenticatedSessions = {
			[token]: { id: userId, email },
			[resumedToken]: { id: userId, email },
		}
		const placeId = `onboarding-place-${run}`
		const displayName = `Hotel Onboarding ${run}`
		const legalName = `Hotel Onboarding ${run} SpA`
		const previousGovernanceEnforcement = process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE

		await upsertGeoPlace({
			id: placeId,
			canonicalName: "Santiago onboarding",
			slug: `santiago-onboarding-${run}`,
			countryCode: "CL",
			placeType: "city",
		})

		process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE = "1"
		try {
			await withSupabaseAuthStub(authenticatedSessions, async () => {
				const identityForm = new FormData()
				identityForm.set("displayName", displayName)
				identityForm.set("legalName", legalName)
				identityForm.set("onboardingNext", "/provider/onboarding/business?vertical=hotel")
				const identityResponse = await providerIdentityPost({
					request: authedFormRequest({
						path: "/api/providers",
						token,
						form: identityForm,
						accept: "text/html",
					}),
				} as any)
				expect(identityResponse.status).toBe(303)
				expect(identityResponse.headers.get("location")).toBe(
					"http://localhost:4321/provider/onboarding/business?vertical=hotel&success=identity_saved"
				)

				const provider = await db
					.select({ id: Provider.id })
					.from(Provider)
					.where(eq(Provider.displayName, displayName))
					.then((rows) => rows[0])
				expect(provider?.id).toBeTruthy()
				const declarationForm = new FormData()
				declarationForm.set("displayName", displayName)
				declarationForm.set("legalName", legalName)
				declarationForm.set("holderType", "entidad")
				declarationForm.set("holderCountry", "CL")
				declarationForm.set("onboardingNext", "/provider/onboarding/business?vertical=hotel")
				const declarationResponse = await providerIdentityUpdatePost({
					params: { id: String(provider?.id) },
					request: authedFormRequest({
						path: `/api/providers/${provider?.id}`,
						token: resumedToken,
						form: declarationForm,
						accept: "text/html",
					}),
				} as any)
				expect(declarationResponse.status).toBe(303)
				expect(declarationResponse.headers.get("location")).toBe(
					"http://localhost:4321/provider/onboarding/business?vertical=hotel&success=identity_saved"
				)
				expect(
					await db
						.select({ id: Provider.id })
						.from(Provider)
						.where(eq(Provider.displayName, displayName))
				).toHaveLength(1)
				const holder = await db
					.select()
					.from(ProviderHolderProfile)
					.where(eq(ProviderHolderProfile.providerId, String(provider?.id)))
					.then((rows) => rows[0])
				expect(holder).toMatchObject({
					holderType: "entidad",
					holderCountry: "CL",
					declarationStatus: "declared",
				})

				const profileForm = new FormData()
				profileForm.set("timezone", "America/Santiago")
				profileForm.set("defaultCurrency", "USD")
				profileForm.set("supportEmail", "soporte-onboarding@example.test")
				profileForm.set("onboardingNext", "/product/create?playbook=launch&step=create&flow=create")
				const profileResponse = await providerProfilePost({
					request: authedFormRequest({
						path: "/api/providers/profile",
						token: resumedToken,
						form: profileForm,
						accept: "text/html",
					}),
				} as any)
				expect(profileResponse.status).toBe(303)
				expect(profileResponse.headers.get("location")).toBe(
					"http://localhost:4321/product/create?playbook=launch&step=create&flow=create&success=ops_saved"
				)
				const profile = await db
					.select({ supportEmail: ProviderProfile.supportEmail })
					.from(ProviderProfile)
					.where(eq(ProviderProfile.providerId, String(provider?.id)))
					.then((rows) => rows[0])
				expect(profile?.supportEmail).toBe("soporte-onboarding@example.test")

				const productForm = new FormData()
				productForm.set("name", "Primer Hotel Onboarding")
				productForm.set("productType", "Hotel")
				productForm.set("geoPlaceId", placeId)
				productForm.set("playbook", "launch")
				productForm.set("_response", "redirect")
				const productResponse = await productCreatePost({
					request: authedFormRequest({
						path: "/api/product/create",
						token,
						form: productForm,
					}),
				} as any)
				expect(productResponse.status).toBe(303)
				const productPath = String(productResponse.headers.get("location") ?? "")
				const productId = /^\/product\/([^/]+)\/content\?/.exec(productPath)?.[1]
				expect(productId).toBeTruthy()
				const product = await db
					.select({ id: Product.id, providerId: Product.providerId })
					.from(Product)
					.where(eq(Product.id, String(productId)))
					.then((rows) => rows[0])
				expect(product).toMatchObject({ id: productId, providerId: provider?.id })
				const policyResponse = await commercialPolicyGet({
					request: new Request(
						`http://localhost:4321/api/onboarding/commercial-policy?productId=${productId}`,
						{
							headers: {
								cookie: `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=fixture`,
							},
						}
					),
				} as any)
				expect(policyResponse.status).toBe(200)
				expect(await policyResponse.json()).toMatchObject({
					mode: "shadow",
					policyStatus: "unsupported",
					capabilities: { publish: false, booking: false },
				})

				const sessionResponse = await preparationSessionPost({
					request: authedJsonRequest({
						path: "/api/onboarding/preparation-session",
						token,
						body: {
							productId,
							playbookId: "launch",
							vertical: "hotel",
							stepId: "rate",
							variantId: "room-onboarding",
							ratePlanId: "rate-onboarding",
							lastPath: `/rates/plans/manage?productId=${productId}&variantId=room-onboarding&ratePlanId=rate-onboarding&playbook=launch&step=rate&flow=create`,
						},
					}),
				} as any)
				expect(sessionResponse.status).toBe(200)
				const session = await db
					.select({
						productId: ProviderPreparationSession.productId,
						stepId: ProviderPreparationSession.stepId,
						variantId: ProviderPreparationSession.variantId,
						ratePlanId: ProviderPreparationSession.ratePlanId,
						lastPath: ProviderPreparationSession.lastPath,
					})
					.from(ProviderPreparationSession)
					.where(eq(ProviderPreparationSession.productId, String(productId)))
					.then((rows) => rows[0])
				expect(session).toMatchObject({
					productId,
					stepId: "rate",
					variantId: "room-onboarding",
					ratePlanId: "rate-onboarding",
				})

				const tourForm = new FormData()
				tourForm.set("name", "Primer Tour Onboarding")
				tourForm.set("productType", "Tour")
				tourForm.set("geoPlaceId", placeId)
				tourForm.set("playbook", "launch-tour")
				tourForm.set("_response", "redirect")
				const tourResponse = await productCreatePost({
					request: authedFormRequest({
						path: "/api/product/create",
						token,
						form: tourForm,
					}),
				} as any)
				expect(tourResponse.status).toBe(303)
				const tourPath = String(tourResponse.headers.get("location") ?? "")
				const tourId = /^\/product\/([^/]+)\/content\?/.exec(tourPath)?.[1]
				expect(tourPath).toContain("playbook=launch-tour")
				expect(tourId).toBeTruthy()
				const savedSessions = await db
					.select({
						productId: ProviderPreparationSession.productId,
						playbookId: ProviderPreparationSession.playbookId,
						vertical: ProviderPreparationSession.vertical,
						stepId: ProviderPreparationSession.stepId,
					})
					.from(ProviderPreparationSession)
					.where(eq(ProviderPreparationSession.providerId, String(provider?.id)))
				expect(savedSessions).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							productId,
							playbookId: "launch",
							vertical: "hotel",
							stepId: "rate",
						}),
						expect.objectContaining({
							productId: tourId,
							playbookId: "launch-tour",
							vertical: "tour",
							stepId: "content",
						}),
					])
				)
				expect(savedSessions.filter((item) => item.playbookId === "launch")).toHaveLength(1)
				expect(savedSessions.filter((item) => item.playbookId === "launch-tour")).toHaveLength(1)
				const resumable = await listActivePreparationSessions(String(provider?.id), userId)
				expect(resumable).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							productId,
							href: expect.stringContaining(`variantId=room-onboarding`),
						}),
						expect.objectContaining({ productId: tourId, vertical: "tour" }),
					])
				)

				const publishForm = new FormData()
				publishForm.set("productId", String(productId))
				const publishResponse = await productPublishPost({
					request: authedFormRequest({
						path: "/api/product/publish",
						token,
						form: publishForm,
					}),
				} as any)
				expect(publishResponse.status).toBe(423)
				const publishPayload = await publishResponse.json()
				expect(publishPayload.error).toBe("provider_configuration_blocked")
				expect(publishPayload.blockers.map((blocker: { id: string }) => blocker.id)).toContain(
					"verification"
				)
			})
		} finally {
			if (previousGovernanceEnforcement === undefined)
				delete process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE
			else process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE = previousGovernanceEnforcement
		}
	})
})
