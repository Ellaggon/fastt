import type { ProductRepositoryPort } from "../../ports/ProductRepositoryPort"
import { productContentSchema } from "../../schemas/product/productContentSchema"
import { z } from "zod"

export async function upsertProductContent(
	deps: { repo: ProductRepositoryPort },
	params: {
		productId: string
		description?: string | null
		highlightsJson: string
		rules?: string | null
	}
): Promise<{ productId: string }> {
	const parsed = productContentSchema.parse({
		productId: params.productId,
		description: params.description ?? undefined,
		highlightsJson: params.highlightsJson,
		rules: params.rules ?? undefined,
	})

	const raw = parsed.highlightsJson.trim()

	// Product UX: users should not be forced to write JSON manually.
	// We accept:
	// - JSON array string: ["a","b"]
	// - plain text: "a\nb" or "a, b"
	let highlights: string[]
	if (raw.startsWith("[")) {
		let highlightsUnknown: unknown
		try {
			highlightsUnknown = JSON.parse(raw)
		} catch {
			throw new z.ZodError([
				{
					code: z.ZodIssueCode.custom,
					message: "highlightsJson must be a valid JSON array or plain text list",
					path: ["highlightsJson"],
				},
			])
		}

		highlights = z.array(z.string().trim().min(1)).min(1).parse(highlightsUnknown)
	} else if (raw.startsWith("{")) {
		// We never accept object JSON here; highlights must be array or plain text.
		throw new z.ZodError([
			{
				code: z.ZodIssueCode.custom,
				message: "highlightsJson must be a JSON array or plain text list",
				path: ["highlightsJson"],
			},
		])
	} else {
		const parts = raw.includes("\n") ? raw.split(/\r?\n/) : raw.split(",")
		highlights = parts.map((s) => s.trim()).filter((s) => s.length > 0)
		highlights = z.array(z.string().trim().min(1)).min(1).parse(highlights)
	}

	const payload: {
		productId: string
		description?: string | null
		highlightsJson: string[]
		rules: string | null
		seoJson: null
	} = {
		productId: parsed.productId,
		highlightsJson: highlights,
		rules: parsed.rules ?? null,
		seoJson: null,
	}
	if (typeof parsed.description === "string" && parsed.description.trim().length > 0) {
		payload.description = parsed.description
	}

	await deps.repo.upsertProductContent(payload)

	return { productId: parsed.productId }
}
