import type { APIRoute } from "astro"
import { z } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import {
	and,
	db,
	eq,
	Product,
	TourOperationalResource,
	TourResourceAssignment,
	Variant,
} from "@/shared/infrastructure/db/compat"

const resourceSchema = z.object({
	name: z.string().trim().min(2).max(160),
	type: z.enum(["guide", "vehicle", "pickup_coordinator"]),
	languages: z.array(z.string().trim().min(2).max(12)).max(12).optional(),
	capacity: z.number().int().positive().max(500).optional(),
})

const assignmentSchema = z.object({
	resourceId: z.string().uuid(),
	variantId: z.string().uuid(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	role: z.enum(["lead_guide", "vehicle", "pickup"]),
})

async function actor(request: Request) {
	const user = await getUserFromRequest(request)
	const providerId = user ? await getProviderIdFromRequest(request, user) : null
	return { user, providerId }
}

/** Lists resources and date assignments for the authenticated tour operator. */
export const GET: APIRoute = async ({ request, url }) => {
	const { providerId } = await actor(request)
	if (!providerId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
	const date = String(url.searchParams.get("date") ?? "").trim()
	const [resources, assignments] = await Promise.all([
		db
			.select()
			.from(TourOperationalResource)
			.where(eq(TourOperationalResource.providerId, providerId)),
		date
			? db
					.select()
					.from(TourResourceAssignment)
					.where(
						and(
							eq(TourResourceAssignment.providerId, providerId),
							eq(TourResourceAssignment.date, date)
						)
					)
			: Promise.resolve([]),
	])
	return new Response(JSON.stringify({ resources, assignments }), {
		headers: { "Content-Type": "application/json" },
	})
}

/** Creates a resource or makes a conflict-protected assignment for one tour date. */
export const POST: APIRoute = async ({ request }) => {
	const { user, providerId } = await actor(request)
	if (!providerId || !user?.id)
		return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
	const body = await request.json().catch(() => null)
	const intent = body && typeof body === "object" ? (body as { intent?: string }).intent : null
	try {
		if (intent === "create_resource") {
			const input = resourceSchema.parse(body)
			const resource = {
				id: crypto.randomUUID(),
				providerId,
				name: input.name,
				type: input.type,
				status: "active",
				languagesJson: input.languages ?? null,
				capacity: input.capacity ?? null,
				createdAt: new Date(),
				updatedAt: new Date(),
			}
			await db.insert(TourOperationalResource).values(resource as any)
			await writeProviderAuditLog({
				providerId,
				actorUserId: user.id,
				action: "tour_resource.created",
				entityType: "TourOperationalResource",
				entityId: resource.id,
				afterJson: resource,
				riskLevel: "medium",
			})
			return new Response(JSON.stringify({ ok: true, resource }), { status: 201 })
		}
		if (intent === "assign") {
			const input = assignmentSchema.parse(body)
			const [resource, variant] = await Promise.all([
				db
					.select({ id: TourOperationalResource.id })
					.from(TourOperationalResource)
					.where(
						and(
							eq(TourOperationalResource.id, input.resourceId),
							eq(TourOperationalResource.providerId, providerId)
						)
					),
				db
					.select({ id: Variant.id })
					.from(Variant)
					.innerJoin(Product, eq(Product.id, Variant.productId))
					.where(and(eq(Variant.id, input.variantId), eq(Product.providerId, providerId))),
			])
			if (!resource[0] || !variant[0]) {
				return new Response(JSON.stringify({ error: "resource_or_departure_not_found" }), {
					status: 404,
				})
			}
			const assignment = {
				id: crypto.randomUUID(),
				providerId,
				...input,
				status: "assigned",
				assignedBy: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			}
			await db.insert(TourResourceAssignment).values(assignment as any)
			await writeProviderAuditLog({
				providerId,
				actorUserId: user.id,
				action: "tour_resource.assigned",
				entityType: "TourResourceAssignment",
				entityId: assignment.id,
				afterJson: assignment,
				riskLevel: "high",
			})
			return new Response(JSON.stringify({ ok: true, assignment }), { status: 201 })
		}
		return new Response(JSON.stringify({ error: "unsupported_intent" }), { status: 400 })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const status = /unique|duplicate/i.test(message) ? 409 : 400
		return new Response(
			JSON.stringify({ error: status === 409 ? "resource_conflict" : "validation_error" }),
			{
				status,
			}
		)
	}
}
