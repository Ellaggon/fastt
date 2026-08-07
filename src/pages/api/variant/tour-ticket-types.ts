import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { asc, db, eq, Tour, TourTicketType } from "@/shared/infrastructure/db/compat"

import { productRepository } from "@/container"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { isTourProductType } from "@/lib/productVerticalRegistry"

const DEFAULT_TICKETS = [
	{ code: "adult" as const, label: "Adulto", minAge: 12, maxAge: null, sortOrder: 10 },
	{ code: "child" as const, label: "Niño", minAge: 3, maxAge: 11, sortOrder: 20 },
	{ code: "infant" as const, label: "Infante", minAge: 0, maxAge: 2, sortOrder: 30 },
]

const upsertSchema = z.object({
	productId: z.string().trim().min(1),
	tickets: z
		.array(
			z.object({
				id: z.string().trim().optional(),
				code: z.enum(["adult", "child", "infant", "custom"]),
				label: z.string().trim().min(1),
				minAge: z.number().int().min(0).nullable().optional(),
				maxAge: z.number().int().min(0).nullable().optional(),
				sortOrder: z.number().int().min(0).default(0),
				isActive: z.boolean().default(true),
			})
		)
		.min(1),
})

async function ensureTourOwned(productId: string, providerId: string) {
	const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
	if (!owned || !isTourProductType(owned.productType)) return null
	const tour = await db
		.select({ productId: Tour.productId })
		.from(Tour)
		.where(eq(Tour.productId, productId))
		.then((rows) => rows[0])
	if (!tour) return null
	return owned
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}

		const productId = String(url.searchParams.get("productId") ?? "").trim()
		if (!productId) {
			return new Response(JSON.stringify({ error: "productId_required" }), { status: 400 })
		}
		const owned = await ensureTourOwned(productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}

		let tickets = await db
			.select()
			.from(TourTicketType)
			.where(eq(TourTicketType.productId, productId))
			.orderBy(asc(TourTicketType.sortOrder), asc(TourTicketType.code))

		if (tickets.length === 0) {
			const now = new Date()
			for (const def of DEFAULT_TICKETS) {
				await db.insert(TourTicketType).values({
					id: crypto.randomUUID(),
					productId,
					code: def.code,
					label: def.label,
					minAge: def.minAge,
					maxAge: def.maxAge,
					sortOrder: def.sortOrder,
					isActive: true,
					createdAt: now,
					updatedAt: now,
				})
			}
			tickets = await db
				.select()
				.from(TourTicketType)
				.where(eq(TourTicketType.productId, productId))
				.orderBy(asc(TourTicketType.sortOrder), asc(TourTicketType.code))
		}

		return new Response(JSON.stringify({ ok: true, tickets }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		console.error("tour-ticket-types GET", e)
		return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })
	}
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
		}
		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
			})
		}

		const body = await request.json().catch(() => ({}))
		const parsed = upsertSchema.parse(body)
		const owned = await ensureTourOwned(parsed.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
		}

		const now = new Date()
		await db.delete(TourTicketType).where(eq(TourTicketType.productId, parsed.productId))
		for (const ticket of parsed.tickets) {
			await db.insert(TourTicketType).values({
				id: ticket.id?.trim() || crypto.randomUUID(),
				productId: parsed.productId,
				code: ticket.code,
				label: ticket.label,
				minAge: ticket.minAge ?? null,
				maxAge: ticket.maxAge ?? null,
				sortOrder: ticket.sortOrder,
				isActive: ticket.isActive,
				createdAt: now,
				updatedAt: now,
			})
		}

		const tickets = await db
			.select()
			.from(TourTicketType)
			.where(eq(TourTicketType.productId, parsed.productId))
			.orderBy(asc(TourTicketType.sortOrder))

		return new Response(JSON.stringify({ ok: true, tickets }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		console.error("tour-ticket-types POST", e)
		return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 })
	}
}
