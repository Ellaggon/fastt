import { describe, it, expect, vi } from "vitest"
import { and, db, eq, Image, ImageUpload, Variant } from "astro:db"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { productImageRepository, productRepository, r2 } from "@/container"
import { updateProductImages } from "@/modules/catalog/public"
import { POST as uploadInitPost } from "@/pages/api/uploads/init"
import { POST as uploadCompletePost } from "@/pages/api/uploads/complete"

// Mock presigning to avoid relying on AWS credential resolution in tests.
vi.mock("@aws-sdk/s3-request-presigner", () => {
	return {
		getSignedUrl: vi.fn(async () => "https://signed.r2.test/put-object?sig=test"),
	}
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
		if (url !== expected) return prevFetch(input, init)

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

describe("integration/r2 image upload system (Product V2)", () => {
	it("Product V2 images endpoint: sets gallery by imageIds, and replacement deletes previous DB rows + triggers R2 deletion (objectKey only)", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"
		const destinationId = "dest_int_r2_prod_v2"
		const providerId = "prov_int_r2_prod_v2"
		const email = "provider-r2@example.com"
		const token = "token_r2"
		const productId = `prod_int_r2_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "R2 Test Destination",
			type: "city",
			country: "CL",
			slug: "r2-test-destination",
		})
		await upsertProvider({ id: providerId, displayName: "R2 Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "R2 Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		const { POST } = await import("@/pages/api/product/images")

		await withSupabaseAuthStub({ [token]: { id: "u_r2", email } }, async () => {
			const prevSend = r2.send.bind(r2)
			const sendSpy = vi.fn(async (command: unknown) => {
				void command
				return {
					ContentType: "image/png",
					ContentLength: 1,
					ETag: '"test"',
				} as any
			})
			;(r2 as any).send = sendSpy

			// First attach
			const initFd1 = new FormData()
			initFd1.set("productId", productId)
			initFd1.set("file", new File([new Uint8Array([1])], "a.png", { type: "image/png" }))
			const initRes1 = await uploadInitPost({
				request: makeAuthedFormRequest({ path: "/api/uploads/init", token, form: initFd1 }),
			} as any)
			expect(initRes1.status).toBe(200)
			const initJson1 = (await readJson(initRes1)) as any

			const completeFd1 = new FormData()
			completeFd1.set("productId", productId)
			completeFd1.set("imageId", initJson1.imageId)
			completeFd1.set("objectKey", initJson1.objectKey)
			const compRes1 = await uploadCompletePost({
				request: makeAuthedFormRequest({ path: "/api/uploads/complete", token, form: completeFd1 }),
			} as any)
			expect(compRes1.status).toBe(200)

			const fd1 = new FormData()
			fd1.set("productId", productId)
			fd1.append("imageId", initJson1.imageId)

			const res1 = await POST({
				request: makeAuthedFormRequest({ path: "/api/product/images", token, form: fd1 }),
			} as any)
			expect(res1.status).toBe(200)

			const after1 = await productImageRepository.listOrderedByProduct(productId)
			expect(after1.length).toBe(1)
			expect(String((after1[0] as any).objectKey || "")).toContain(`products/${productId}/`)

			// Second attach replaces the full set (because endpoint doesn't send ids).
			const initFd2 = new FormData()
			initFd2.set("productId", productId)
			initFd2.set("file", new File([new Uint8Array([2])], "b.png", { type: "image/png" }))
			const initRes2 = await uploadInitPost({
				request: makeAuthedFormRequest({ path: "/api/uploads/init", token, form: initFd2 }),
			} as any)
			expect(initRes2.status).toBe(200)
			const initJson2 = (await readJson(initRes2)) as any

			const completeFd2 = new FormData()
			completeFd2.set("productId", productId)
			completeFd2.set("imageId", initJson2.imageId)
			completeFd2.set("objectKey", initJson2.objectKey)
			const compRes2 = await uploadCompletePost({
				request: makeAuthedFormRequest({ path: "/api/uploads/complete", token, form: completeFd2 }),
			} as any)
			expect(compRes2.status).toBe(200)

			const fd2 = new FormData()
			fd2.set("productId", productId)
			fd2.append("imageId", initJson2.imageId)

			const res2 = await POST({
				request: makeAuthedFormRequest({ path: "/api/product/images", token, form: fd2 }),
			} as any)
			expect(res2.status).toBe(200)

			const after2 = await productImageRepository.listOrderedByProduct(productId)
			expect(after2.length).toBe(1)
			expect(String((after2[0] as any).objectKey || "")).toContain(`products/${productId}/`)

			// R2 deletion attempted for the removed image.
			expect(sendSpy).toHaveBeenCalled()
			;(r2 as any).send = prevSend
		})
	})

	it("Variant images use tracked uploads and removed gallery images are deleted from R2", async () => {
		process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "test-bucket"
		const destinationId = "dest_int_r2_variant"
		const providerId = "prov_int_r2_variant"
		const email = "provider-r2-variant@example.com"
		const token = "token_r2_variant"
		const productId = `prod_int_r2_variant_${crypto.randomUUID()}`
		const variantId = `variant_int_r2_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "R2 Variant Destination",
			type: "city",
			country: "CL",
			slug: "r2-variant-destination",
		})
		await upsertProvider({ id: providerId, displayName: "R2 Variant Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "R2 Variant Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await db.insert(Variant).values({
			id: variantId,
			productId,
			name: "Habitación R2",
			kind: "hotel_room",
			status: "ready",
			isActive: true,
		})

		const { POST: setVariantImagesPost } = await import("@/pages/api/variant/images")

		await withSupabaseAuthStub({ [token]: { id: "u_r2_variant", email } }, async () => {
			const prevSend = r2.send.bind(r2)
			const sendSpy = vi.fn(async (command: unknown) => {
				void command
				return {
					ContentType: "image/png",
					ContentLength: 1,
					ETag: '"variant-test"',
				} as any
			})
			;(r2 as any).send = sendSpy

			const initFd = new FormData()
			initFd.set("productId", productId)
			initFd.set("file", new File([new Uint8Array([3])], "room.png", { type: "image/png" }))
			const initRes = await uploadInitPost({
				request: makeAuthedFormRequest({ path: "/api/uploads/init", token, form: initFd }),
			} as any)
			expect(initRes.status).toBe(200)
			const initJson = (await readJson(initRes)) as any

			const completeFd = new FormData()
			completeFd.set("productId", productId)
			completeFd.set("imageId", initJson.imageId)
			completeFd.set("objectKey", initJson.objectKey)
			completeFd.set("entityType", "variant")
			completeFd.set("entityId", variantId)
			const completeRes = await uploadCompletePost({
				request: makeAuthedFormRequest({ path: "/api/uploads/complete", token, form: completeFd }),
			} as any)
			expect(completeRes.status).toBe(200)

			const attached = await db
				.select()
				.from(Image)
				.where(and(eq(Image.id, initJson.imageId), eq(Image.entityId, variantId)))
				.all()
			expect(attached).toHaveLength(1)
			const upload = await db
				.select()
				.from(ImageUpload)
				.where(eq(ImageUpload.imageId, initJson.imageId))
				.all()
			expect(upload).toHaveLength(1)
			expect(String(upload[0]?.status ?? "")).toBe("completed")

			const emptyGallery = new FormData()
			emptyGallery.set("variantId", variantId)
			const removeRes = await setVariantImagesPost({
				request: makeAuthedFormRequest({
					path: "/api/variant/images",
					token,
					form: emptyGallery,
				}),
			} as any)
			expect(removeRes.status).toBe(200)

			await expect(
				db.select().from(Image).where(eq(Image.id, initJson.imageId)).all()
			).resolves.toHaveLength(0)
			await expect(
				db.select().from(ImageUpload).where(eq(ImageUpload.imageId, initJson.imageId)).all()
			).resolves.toHaveLength(0)
			expect(sendSpy.mock.calls.map(([command]) => (command as any)?.input?.Key)).toContain(
				initJson.objectKey
			)
			;(r2 as any).send = prevSend
		})
	})

	it("Reorder flow (use-case): updates order persistently using existing ids", async () => {
		const destinationId = "dest_int_r2_reorder"
		const providerId = "prov_int_r2_reorder"
		const productId = `prod_int_r2_reorder_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "R2 Reorder Destination",
			type: "city",
			country: "CL",
			slug: "r2-reorder-destination",
		})
		await upsertProvider({
			id: providerId,
			displayName: "R2 Provider",
			ownerEmail: "reorder@example.com",
		})
		await upsertProduct({
			id: productId,
			name: "R2 Product Reorder",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		// Seed two existing images (DB is real).
		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/1.jpg",
			order: 0,
			isPrimary: true,
		})
		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/2.jpg",
			order: 1,
			isPrimary: false,
		})

		const existing = await productImageRepository.listOrderedByProduct(productId)
		expect(existing.length).toBe(2)

		// Swap order by sending ids reversed.
		const imagesPayload = [
			{
				id: (existing[1] as any).id as string,
				url: (existing[1] as any).url as string,
				isPrimary: false,
			},
			{
				id: (existing[0] as any).id as string,
				url: (existing[0] as any).url as string,
				isPrimary: true,
			},
		]

		const prevSend = r2.send.bind(r2)
		;(r2 as any).send = vi.fn(async () => ({})) as any

		const res = await updateProductImages({
			ensureOwned: (pid, prov) => productRepository.ensureProductOwnedByProvider(pid, prov),
			repo: productImageRepository,
			providerId,
			productId,
			images: imagesPayload,
		})
		expect(res.status).toBe(200)

		const updated = await productImageRepository.listOrderedByProduct(productId)
		expect((updated[0] as any).url).toBe("https://example.com/2.jpg")
		expect((updated[1] as any).url).toBe("https://example.com/1.jpg")
		;(r2 as any).send = prevSend
	})
})
