import { describe, expect, it, vi } from "vitest"
import {
	confirmProductImageUpload,
	confirmedProductGalleryIds,
	type ProductImageUpload,
} from "@/lib/forms/productImageUpload"
const item = (): ProductImageUpload => ({
	file: new File(["image"], "tour.jpg", { type: "image/jpeg" }),
})
const initialized = () =>
	Response.json({
		imageId: "image-new",
		objectKey: "tour/key",
		signedUrl: "https://storage.test/upload",
	})
describe("confirmed tour image recovery", () => {
	it("reuses the upload identity after a lost completion response", async () => {
		const upload = item()
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(initialized())
			.mockResolvedValueOnce(new Response())
			.mockRejectedValueOnce(new Error("Response lost"))
			.mockResolvedValueOnce(new Response())
			.mockResolvedValueOnce(new Response())
		await expect(confirmProductImageUpload(upload, "tour", request)).rejects.toThrow(
			"Response lost"
		)
		expect(await confirmProductImageUpload(upload, "tour", request)).toBe("image-new")
		expect(request.mock.calls.filter(([url]) => url === "/api/uploads/init")).toHaveLength(1)
		const attempts = request.mock.calls.filter(([url]) => url === "/api/uploads/complete")
		expect(attempts.map(([, options]) => (options?.body as FormData).get("imageId"))).toEqual([
			"image-new",
			"image-new",
		])
	})
	it("preserves order and all confirmed images when gallery saving is retried", async () => {
		const upload = item()
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(initialized())
			.mockResolvedValueOnce(new Response())
			.mockResolvedValueOnce(new Response())
		await confirmProductImageUpload(upload, "tour", request)
		expect(await confirmProductImageUpload(upload, "tour", request)).toBe("image-new")
		expect(request).toHaveBeenCalledTimes(3)
		expect(confirmedProductGalleryIds(["cover", "detail"], [upload, upload, item()])).toEqual([
			"cover",
			"detail",
			"image-new",
		])
	})
})
