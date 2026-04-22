import type { APIRoute } from "astro"
import { z } from "zod"

import { simulateBulkInventoryOperation } from "@/modules/inventory/public"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { productRepository, variantManagementRepository } from "@/container"

const bulkPreviewLegacySchema = z.object({
	variantId: z.string().min(1),
	dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
	operation: z.object({
		type: z.enum(["open_sales", "close_sales", "set_inventory"]),
		value: z.number().int().min(0).optional(),
	}),
})

const bulkPreviewV2Schema = z.object({
	selection: z.object({
		variantIds: z.array(z.string().min(1)).min(1),
	}),
	dateRange: z.object({
		from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	}),
	filters: z
		.object({
			daysOfWeek: z.array(z.string().min(1)).optional(),
		})
		.optional(),
	operation: z.object({
		type: z.enum(["OPEN", "CLOSE", "SET_INVENTORY"]),
		value: z.number().int().min(0).optional(),
	}),
	context: z
		.object({
			dryRun: z.boolean().optional(),
			source: z.string().optional(),
		})
		.optional(),
})

const bulkPreviewSchema = z.union([bulkPreviewLegacySchema, bulkPreviewV2Schema])

function extractVariantIds(input: z.infer<typeof bulkPreviewSchema>): string[] {
	if ("selection" in input) return input.selection.variantIds
	return [input.variantId]
}

async function ensureVariantOwnership(
	request: Request,
	variantId: string
): Promise<Response | null> {
	const user = await getUserFromRequest(request)
	if (!user?.email) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const variant = await variantManagementRepository.getVariantById(variantId)
	if (!variant) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const owned = await productRepository.ensureProductOwnedByProvider(variant.productId, providerId)
	if (!owned) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	return null
}

export const POST: APIRoute = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as unknown
	const parsed = bulkPreviewSchema.safeParse(payload)
	if (!parsed.success) {
		return new Response(
			JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	const variantIds = Array.from(new Set(extractVariantIds(parsed.data)))
	for (const variantId of variantIds) {
		const authError = await ensureVariantOwnership(request, variantId)
		if (authError) return authError
	}

	const result = await simulateBulkInventoryOperation({
		request,
		input: parsed.data,
	})

	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
