import { describe, it, expect, vi } from "vitest"

import { upsertDestination } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { productV2Repository, subtypeRepository } from "@/container"

import { POST as createProductPost } from "@/pages/api/product-v2/create"
import { POST as upsertContentPost } from "@/pages/api/product-v2/content"
import { POST as upsertLocationPost } from "@/pages/api/product-v2/location"
import { POST as upsertImagesPost } from "@/pages/api/product-v2/images"
import { POST as upsertSubtypePost } from "@/pages/api/product-v2/subtype"
import { POST as evaluatePost } from "@/pages/api/product-v2/evaluate"
import { POST as uploadInitPost } from "@/pages/api/uploads/init"
import { POST as uploadCompletePost } from "@/pages/api/uploads/complete"
import { r2 } from "@/container"

// Presigning is an infrastructure detail; stub it to keep API tests deterministic.
vi.mock("@aws-sdk/s3-request-presigner", () => {
	return { getSignedUrl: vi.fn(async () => "https://signed.r2.test/put-object?sig=test") }
})

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevFetch = globalThis.fetch

	// Enable Supabase path in getUserFromRequest() without hitting the network.
	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) {
			return new Response("fetch not mocked", { status: 500 })
		}

		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization

		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })

		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return fn().finally(() => {
		globalThis.fetch = prevFetch
		if (prevUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = prevUrl
		if (prevAnon === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = prevAnon
	})
}

function makeAuthedFormRequest(params: { path: string; token?: string; form: FormData }): Request {
	const headers = new Headers()
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	try {
		return txt ? JSON.parse(txt) : null
	} catch {
		return { _raw: txt }
	}
}

describe("integration/catalog Product V2 API", () => {
	it("full API flow => ready", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"
		const tokenA = "token_a"
		const emailA = "usera@example.com"
		const providerA = "prov_int_product_v2_api_a"
		const destinationId = "dest_int_product_v2_api"

		await upsertDestination({
			id: destinationId,
			name: "Product V2 API Destination",
			type: "city",
			country: "CL",
			slug: "product-v2-api-destination",
		})
		await upsertProvider({ id: providerA, companyName: "Provider A", userEmail: emailA })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_a", email: emailA },
			},
			async () => {
				// Stub R2 operations used by uploads/complete (HEAD) and by image replacement (DELETE).
				const prevSend = r2.send.bind(r2)
				;(r2 as any).send = vi.fn(async () => ({
					ContentType: "image/png",
					ContentLength: 3,
					ETag: '"x"',
				})) as any

				// 1) create
				const createForm = new FormData()
				createForm.set("name", "API Product V2")
				createForm.set("productType", "Hotel")
				createForm.set("destinationId", destinationId)

				const createRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: createForm,
					}),
				} as any)
				expect(createRes.status).toBe(200)
				const created = (await readJson(createRes)) as { id?: string }
				expect(created?.id).toBeTruthy()
				const productId = created.id!

				// 2) content
				const contentForm = new FormData()
				contentForm.set("productId", productId)
				contentForm.set("highlightsJson", JSON.stringify(["Highlight 1"]))
				contentForm.set("rules", "No smoking")

				const contentRes = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenA,
						form: contentForm,
					}),
				} as any)
				expect(contentRes.status).toBe(200)

				// 3) location
				const locForm = new FormData()
				locForm.set("productId", productId)
				locForm.set("address", "API Address")
				locForm.set("lat", "-16.4958")
				locForm.set("lng", "-68.1333")

				const locRes = await upsertLocationPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/location",
						token: tokenA,
						form: locForm,
					}),
				} as any)
				expect(locRes.status).toBe(200)

				// 4) uploads/init + uploads/complete => creates Image rows with objectKey
				const uploadIds: string[] = []
				for (const name of ["a.png", "b.png"]) {
					const initFd = new FormData()
					initFd.set("productId", productId)
					initFd.set("file", new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }))

					const initRes = await uploadInitPost({
						request: makeAuthedFormRequest({
							path: "/api/uploads/init",
							token: tokenA,
							form: initFd,
						}),
					} as any)
					expect(initRes.status).toBe(200)
					const initJson = (await readJson(initRes)) as any
					expect(initJson.imageId).toBeTruthy()
					expect(initJson.objectKey).toContain(`products/${productId}/`)

					const completeFd = new FormData()
					completeFd.set("productId", productId)
					completeFd.set("imageId", initJson.imageId)
					completeFd.set("objectKey", initJson.objectKey)

					const completeRes = await uploadCompletePost({
						request: makeAuthedFormRequest({
							path: "/api/uploads/complete",
							token: tokenA,
							form: completeFd,
						}),
					} as any)
					expect(completeRes.status).toBe(200)
					uploadIds.push(initJson.imageId)
				}

				// 5) images/set by imageId (no URLs)
				const imgSetFd = new FormData()
				imgSetFd.set("productId", productId)
				for (const id of uploadIds) imgSetFd.append("imageId", id)

				const imgRes = await upsertImagesPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/images",
						token: tokenA,
						form: imgSetFd,
					}),
				} as any)
				expect(imgRes.status).toBe(200)

				// 6) subtype (hotel, minimal fields)
				const subtypeForm = new FormData()
				subtypeForm.set("productId", productId)

				const subtypeRes = await upsertSubtypePost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/subtype",
						token: tokenA,
						form: subtypeForm,
					}),
				} as any)
				expect(subtypeRes.status).toBe(200)

				// 7) evaluate
				const evalForm = new FormData()
				evalForm.set("productId", productId)

				const evalRes = await evaluatePost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/evaluate",
						token: tokenA,
						form: evalForm,
					}),
				} as any)
				expect(evalRes.status).toBe(200)
				const evaluated = (await readJson(evalRes)) as {
					state?: string
					validationErrors?: unknown[]
				}
				expect(evaluated.state).toBe("ready")
				expect(Array.isArray(evaluated.validationErrors)).toBe(true)
				expect((evaluated.validationErrors as any[]).length).toBe(0)

				const agg = await productV2Repository.getProductAggregate(productId)
				expect(agg?.status?.state).toBe("ready")
				expect(agg?.status?.validationErrorsJson).toBeNull()
				expect(agg?.imagesCount).toBeGreaterThanOrEqual(1)
				expect(agg?.subtypeExists).toBe(true)
				;(r2 as any).send = prevSend
			}
		)
	})

	it("content endpoint accepts plain text highlights (newline separated)", async () => {
		const tokenA = "token_plain"
		const emailA = "plain@example.com"
		const providerA = "prov_int_product_v2_api_plain"
		const destinationId = "dest_int_product_v2_api_plain"

		await upsertDestination({
			id: destinationId,
			name: "Product V2 API Destination Plain",
			type: "city",
			country: "CL",
			slug: "product-v2-api-destination-plain",
		})
		await upsertProvider({ id: providerA, companyName: "Provider Plain", userEmail: emailA })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_plain", email: emailA },
			},
			async () => {
				const createForm = new FormData()
				createForm.set("name", "API Product V2 Plain")
				createForm.set("productType", "Hotel")
				createForm.set("destinationId", destinationId)

				const createRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: createForm,
					}),
				} as any)
				expect(createRes.status).toBe(200)
				const created = (await readJson(createRes)) as any
				const productId = created.id as string

				const contentForm = new FormData()
				contentForm.set("productId", productId)
				contentForm.set("highlightsJson", "Great location\nBreakfast included")
				const contentRes = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenA,
						form: contentForm,
					}),
				} as any)
				expect(contentRes.status).toBe(200)

				const agg = await productV2Repository.getProductAggregate(productId)
				expect(agg?.content?.highlightsJson).toEqual(["Great location", "Breakfast included"])
			}
		)
	})

	it("ownership: user B cannot modify user A's product (content => 404)", async () => {
		const tokenA = "token_a"
		const tokenB = "token_b"
		const emailA = "usera_own@example.com"
		const emailB = "userb_own@example.com"
		const providerA = "prov_int_product_v2_api_own_a"
		const providerB = "prov_int_product_v2_api_own_b"
		const destinationId = "dest_int_product_v2_api_own"

		await upsertDestination({
			id: destinationId,
			name: "Product V2 API Destination Own",
			type: "city",
			country: "CL",
			slug: "product-v2-api-destination-own",
		})
		await upsertProvider({ id: providerA, companyName: "Provider A", userEmail: emailA })
		await upsertProvider({ id: providerB, companyName: "Provider B", userEmail: emailB })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_a", email: emailA },
				[tokenB]: { id: "u_b", email: emailB },
			},
			async () => {
				const createForm = new FormData()
				createForm.set("name", "Owned Product")
				createForm.set("productType", "Hotel")
				createForm.set("destinationId", destinationId)

				const createRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: createForm,
					}),
				} as any)
				expect(createRes.status).toBe(200)
				const created = (await readJson(createRes)) as { id?: string }
				const productId = created.id!

				const contentForm = new FormData()
				contentForm.set("productId", productId)
				contentForm.set("highlightsJson", JSON.stringify(["x"]))
				contentForm.set("rules", "")

				const contentRes = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenB,
						form: contentForm,
					}),
				} as any)
				expect(contentRes.status).toBe(404)
			}
		)
	})

	it("idempotency: content/location can be called twice (last write wins)", async () => {
		const tokenA = "token_a"
		const emailA = "usera_idem@example.com"
		const providerA = "prov_int_product_v2_api_idem"
		const destinationId = "dest_int_product_v2_api_idem"

		await upsertDestination({
			id: destinationId,
			name: "Product V2 API Destination Idem",
			type: "city",
			country: "CL",
			slug: "product-v2-api-destination-idem",
		})
		await upsertProvider({ id: providerA, companyName: "Provider A", userEmail: emailA })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_a", email: emailA },
			},
			async () => {
				const createForm = new FormData()
				createForm.set("name", "Idempotent Product")
				createForm.set("productType", "Hotel")
				createForm.set("destinationId", destinationId)
				const createRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: createForm,
					}),
				} as any)
				const { id: productId } = (await readJson(createRes)) as any

				const contentForm1 = new FormData()
				contentForm1.set("productId", productId)
				contentForm1.set("highlightsJson", JSON.stringify(["v1"]))
				const contentRes1 = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenA,
						form: contentForm1,
					}),
				} as any)
				expect(contentRes1.status).toBe(200)

				const contentForm2 = new FormData()
				contentForm2.set("productId", productId)
				contentForm2.set("highlightsJson", JSON.stringify(["v2"]))
				const contentRes2 = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenA,
						form: contentForm2,
					}),
				} as any)
				expect(contentRes2.status).toBe(200)

				const locForm1 = new FormData()
				locForm1.set("productId", productId)
				locForm1.set("lat", "1")
				locForm1.set("lng", "2")
				const locRes1 = await upsertLocationPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/location",
						token: tokenA,
						form: locForm1,
					}),
				} as any)
				expect(locRes1.status).toBe(200)

				const locForm2 = new FormData()
				locForm2.set("productId", productId)
				locForm2.set("lat", "3")
				locForm2.set("lng", "4")
				const locRes2 = await upsertLocationPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/location",
						token: tokenA,
						form: locForm2,
					}),
				} as any)
				expect(locRes2.status).toBe(200)

				const agg = await productV2Repository.getProductAggregate(productId)
				expect(agg?.content?.highlightsJson).toEqual(["v2"])
				expect(agg?.location?.lat).toBe(3)
				expect(agg?.location?.lng).toBe(4)
			}
		)
	})

	it("consistency: hotel product cannot create a Tour row via subtype endpoint", async () => {
		const tokenA = "token_a"
		const emailA = "usera_consistency@example.com"
		const providerA = "prov_int_product_v2_api_consistency"
		const destinationId = "dest_int_product_v2_api_consistency"

		await upsertDestination({
			id: destinationId,
			name: "Product V2 API Destination Consistency",
			type: "city",
			country: "CL",
			slug: "product-v2-api-destination-consistency",
		})
		await upsertProvider({ id: providerA, companyName: "Provider A", userEmail: emailA })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_a", email: emailA },
			},
			async () => {
				const createForm = new FormData()
				createForm.set("name", "Consistency Product")
				createForm.set("productType", "Hotel")
				createForm.set("destinationId", destinationId)
				const createRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: createForm,
					}),
				} as any)
				const { id: productId } = (await readJson(createRes)) as any

				const subtypeForm = new FormData()
				subtypeForm.set("productId", productId)
				// Try to send Tour-ish fields. The use-case must still respect DB productType (Hotel).
				subtypeForm.set("duration", "2h")
				subtypeForm.set("difficultyLevel", "easy")

				const subtypeRes = await upsertSubtypePost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/subtype",
						token: tokenA,
						form: subtypeForm,
					}),
				} as any)
				expect(subtypeRes.status).toBe(200)

				expect(await subtypeRepository.subtypeExists(productId, "hotel")).toBe(true)
				expect(await subtypeRepository.subtypeExists(productId, "tour")).toBe(false)
			}
		)
	})

	it("invalid inputs => 400 validation_error", async () => {
		const tokenA = "token_a"
		const emailA = "usera_invalid@example.com"
		const providerA = "prov_int_product_v2_api_invalid"
		const destinationId = "dest_int_product_v2_api_invalid"

		await upsertDestination({
			id: destinationId,
			name: "Product V2 API Destination Invalid",
			type: "city",
			country: "CL",
			slug: "product-v2-api-destination-invalid",
		})
		await upsertProvider({ id: providerA, companyName: "Provider A", userEmail: emailA })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_a", email: emailA },
			},
			async () => {
				// empty name
				const createForm = new FormData()
				createForm.set("name", "")
				createForm.set("productType", "Hotel")
				createForm.set("destinationId", destinationId)
				const createRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: createForm,
					}),
				} as any)
				expect(createRes.status).toBe(400)
				const createJson = await readJson(createRes)
				expect(createJson?.error).toBe("validation_error")
				expect(Array.isArray(createJson?.details)).toBe(true)

				// create a valid product for further invalid updates
				const okForm = new FormData()
				okForm.set("name", "OK")
				okForm.set("productType", "Hotel")
				okForm.set("destinationId", destinationId)
				const okRes = await createProductPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/create",
						token: tokenA,
						form: okForm,
					}),
				} as any)
				const { id: productId } = (await readJson(okRes)) as any

				// invalid highlightsJson
				const contentForm = new FormData()
				contentForm.set("productId", productId)
				contentForm.set("highlightsJson", "{not-json")
				const contentRes = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenA,
						form: contentForm,
					}),
				} as any)
				expect(contentRes.status).toBe(400)
				const contentJson = await readJson(contentRes)
				expect(contentJson?.error).toBe("validation_error")

				// empty highlightsJson
				const emptyContentForm = new FormData()
				emptyContentForm.set("productId", productId)
				emptyContentForm.set("highlightsJson", "")
				const emptyContentRes = await upsertContentPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/content",
						token: tokenA,
						form: emptyContentForm,
					}),
				} as any)
				expect(emptyContentRes.status).toBe(400)
				const emptyContentJson = await readJson(emptyContentRes)
				expect(emptyContentJson?.error).toBe("validation_error")

				// invalid lat/lng
				const locForm = new FormData()
				locForm.set("productId", productId)
				locForm.set("lat", "NaN")
				locForm.set("lng", "NaN")
				const locRes = await upsertLocationPost({
					request: makeAuthedFormRequest({
						path: "/api/product-v2/location",
						token: tokenA,
						form: locForm,
					}),
				} as any)
				expect(locRes.status).toBe(400)
				const locJson = await readJson(locRes)
				expect(locJson?.error).toBe("validation_error")
			}
		)
	})
})
