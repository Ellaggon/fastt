import { describe, it, expect, vi } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { r2, productImageRepository, cleanupStaleUploads, imageUploadRepository } from "@/container"

import { POST as uploadInitPost } from "@/pages/api/uploads/init"
import { POST as uploadCompletePost } from "@/pages/api/uploads/complete"
import { POST as setImagesPost } from "@/pages/api/product-v2/images"

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

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response("fetch not mocked", { status: 500 })

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

describe("integration/r2 upload hardening", () => {
	it("cleanupStaleUploads deletes pending upload objects + DB rows", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"

		const destinationId = "dest_int_cleanup"
		const providerId = "prov_int_cleanup"
		const email = "cleanup@example.com"
		const productId = `prod_int_cleanup_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Cleanup Destination",
			type: "city",
			country: "CL",
			slug: "cleanup-destination",
		})
		await upsertProvider({ id: providerId, displayName: "Cleanup Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Cleanup Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		const imageId = crypto.randomUUID()
		await imageUploadRepository.createPending({
			id: imageId,
			productId,
			providerId,
			objectKey: `products/${productId}/${imageId}.png`,
			expectedContentType: "image/png",
			expectedBytes: 1,
			createdAt: new Date(Date.now() - 120 * 60_000), // 2h ago
		})

		const prevSend = r2.send.bind(r2)
		const sendSpy = vi.fn(async () => ({})) as any
		;(r2 as any).send = sendSpy

		const res = await cleanupStaleUploads({ olderThanMinutes: 30 })
		expect(res.deleted).toBeGreaterThanOrEqual(1)
		expect(sendSpy).toHaveBeenCalled()

		const after = await imageUploadRepository.getById(imageId)
		expect(after).toBeNull()
		;(r2 as any).send = prevSend
	})

	it("complete with missing object => 400", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"

		const token = "t_missing"
		const email = "missing@example.com"
		const providerId = "prov_missing"
		const destinationId = "dest_missing"
		const productId = `prod_missing_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Missing",
			type: "city",
			country: "CL",
			slug: "missing",
		})
		await upsertProvider({ id: providerId, displayName: "Missing Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Missing Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_m", email } }, async () => {
			const prevSend = r2.send.bind(r2)
			;(r2 as any).send = vi.fn(async () => {
				throw new Error("NotFound")
			}) as any

			const initFd = new FormData()
			initFd.set("productId", productId)
			initFd.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }))
			const initRes = await uploadInitPost({
				request: makeAuthedFormRequest({ path: "/api/uploads/init", token, form: initFd }),
			} as any)
			const initJson = (await readJson(initRes)) as any

			const completeFd = new FormData()
			completeFd.set("productId", productId)
			completeFd.set("imageId", initJson.imageId)
			completeFd.set("objectKey", initJson.objectKey)

			const completeRes = await uploadCompletePost({
				request: makeAuthedFormRequest({ path: "/api/uploads/complete", token, form: completeFd }),
			} as any)
			expect(completeRes.status).toBe(400)
			;(r2 as any).send = prevSend
		})
	})

	it("complete with invalid content-type => 400", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"

		const token = "t_ct"
		const email = "ct@example.com"
		const providerId = "prov_ct"
		const destinationId = "dest_ct"
		const productId = `prod_ct_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "CT",
			type: "city",
			country: "CL",
			slug: "ct",
		})
		await upsertProvider({ id: providerId, displayName: "CT Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "CT Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_ct", email } }, async () => {
			const prevSend = r2.send.bind(r2)
			;(r2 as any).send = vi.fn(async () => ({
				ContentType: "text/plain",
				ContentLength: 3,
			})) as any

			const initFd = new FormData()
			initFd.set("productId", productId)
			initFd.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }))
			const initRes = await uploadInitPost({
				request: makeAuthedFormRequest({ path: "/api/uploads/init", token, form: initFd }),
			} as any)
			const initJson = (await readJson(initRes)) as any

			const completeFd = new FormData()
			completeFd.set("productId", productId)
			completeFd.set("imageId", initJson.imageId)
			completeFd.set("objectKey", initJson.objectKey)

			const completeRes = await uploadCompletePost({
				request: makeAuthedFormRequest({ path: "/api/uploads/complete", token, form: completeFd }),
			} as any)
			expect(completeRes.status).toBe(400)
			;(r2 as any).send = prevSend
		})
	})

	it("image limit exceeded => 400 on init", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"

		const token = "t_limit"
		const email = "limit@example.com"
		const providerId = "prov_limit"
		const destinationId = "dest_limit"
		const productId = `prod_limit_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Limit",
			type: "city",
			country: "CL",
			slug: "limit",
		})
		await upsertProvider({ id: providerId, displayName: "Limit Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Limit Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		// Seed 20 images (max).
		for (let i = 0; i < 20; i++) {
			await productImageRepository.insertImage({
				productId,
				url: `https://example.com/${i}.jpg`,
				objectKey: `products/${productId}/seed-${i}.jpg`,
				order: i,
				isPrimary: i === 0,
			})
		}

		await withSupabaseAuthStub({ [token]: { id: "u_l", email } }, async () => {
			const initFd = new FormData()
			initFd.set("productId", productId)
			initFd.set("file", new File([new Uint8Array([1])], "a.png", { type: "image/png" }))

			const initRes = await uploadInitPost({
				request: makeAuthedFormRequest({ path: "/api/uploads/init", token, form: initFd }),
			} as any)
			expect(initRes.status).toBe(400)
		})
	})

	it("duplicate imageIds in attach => 400", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"

		const token = "t_dup"
		const email = "dup@example.com"
		const providerId = "prov_dup"
		const destinationId = "dest_dup"
		const productId = `prod_dup_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dup",
			type: "city",
			country: "CL",
			slug: "dup",
		})
		await upsertProvider({ id: providerId, displayName: "Dup Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Dup Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		// Insert one image row.
		const imgId = crypto.randomUUID()
		await productImageRepository.insertImage({
			id: imgId,
			productId,
			url: "https://example.com/x.jpg",
			objectKey: `products/${productId}/${imgId}.jpg`,
			order: 0,
			isPrimary: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_d", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.append("imageId", imgId)
			fd.append("imageId", imgId) // duplicate

			const res = await setImagesPost({
				request: makeAuthedFormRequest({ path: "/api/product-v2/images", token, form: fd }),
			} as any)
			expect(res.status).toBe(400)
		})
	})
})
