import { afterEach, expect, test, vi } from "vitest"

import {
	DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES,
	submitDocumentMultipartFallback,
} from "@/lib/documents/direct-upload-fallback"

afterEach(() => vi.restoreAllMocks())

test("falls back to multipart for small files and accepts only a same-origin redirect", async () => {
	const request = vi.fn<typeof fetch>().mockResolvedValue(
		Response.json({ ok: true, redirectTo: "/provider/settings/verification?result=submitted" })
	)
	const action = new URL("https://fastt.test/api/provider/settings/documents")
	const formData = new FormData()
	formData.set("idempotencyKey", "retry-a")

	const redirectTo = await submitDocumentMultipartFallback({
		action,
		formData,
		fileSizeBytes: 1024,
		request,
	})

	expect(redirectTo).toBe("https://fastt.test/provider/settings/verification?result=submitted")
	expect(request).toHaveBeenCalledWith(
		action,
		expect.objectContaining({ method: "POST", body: formData })
	)
})

test("does not send multipart above its serverless payload budget", async () => {
	const request = vi.fn<typeof fetch>()
	const result = await submitDocumentMultipartFallback({
		action: new URL("https://fastt.test/api/provider/settings/documents"),
		formData: new FormData(),
		fileSizeBytes: DOCUMENT_MULTIPART_FALLBACK_LIMIT_BYTES + 1,
		request,
	})

	expect(result).toBeNull()
	expect(request).not.toHaveBeenCalled()
})

test("rejects external redirects and failed multipart requests", async () => {
	const action = new URL("https://fastt.test/api/provider/settings/documents")
	const base = { action, formData: new FormData(), fileSizeBytes: 1024 }
	const external = await submitDocumentMultipartFallback({
		...base,
		request: vi.fn<typeof fetch>().mockResolvedValue(
			Response.json({ ok: true, redirectTo: "https://attacker.test/" })
		),
	})
	const failed = await submitDocumentMultipartFallback({
		...base,
		request: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
	})

	expect(external).toBeNull()
	expect(failed).toBeNull()
})
