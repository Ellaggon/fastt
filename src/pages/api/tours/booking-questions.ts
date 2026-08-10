import type { APIRoute } from "astro"
import { z } from "zod"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import {
	and,
	asc,
	db,
	eq,
	first,
	Product,
	Tour,
	TourBookingQuestion,
} from "@/shared/infrastructure/db/compat"

const bookingQuestionSchema = z.object({
	id: z.string().uuid(),
	code: z.enum([
		"pickup_location",
		"language",
		"dietary",
		"weight",
		"height",
		"mobility",
		"custom",
	]),
	label: z.string().trim().min(3).max(180),
	required: z.boolean().default(false),
})

const payloadSchema = z.object({
	productId: z.string().uuid(),
	questions: z.array(bookingQuestionSchema).max(10),
})

async function ownedTour(productId: string, providerId: string) {
	return db
		.select({ productId: Tour.productId })
		.from(Tour)
		.innerJoin(Product, eq(Product.id, Tour.productId))
		.where(and(eq(Tour.productId, productId), eq(Product.providerId, providerId)))
		.then(first)
}

export const GET: APIRoute = async ({ request, url }) => {
	const user = await getUserFromRequest(request)
	const providerId = user ? await getProviderIdFromRequest(request, user) : null
	if (!providerId) return Response.json({ error: "unauthorized" }, { status: 401 })
	const productId = String(url.searchParams.get("productId") ?? "").trim()
	const tour = productId ? await ownedTour(productId, providerId) : null
	if (!tour) return Response.json({ error: "not_found" }, { status: 404 })
	const questions = await db
		.select({
			id: TourBookingQuestion.id,
			code: TourBookingQuestion.code,
			label: TourBookingQuestion.label,
			required: TourBookingQuestion.isRequired,
		})
		.from(TourBookingQuestion)
		.where(eq(TourBookingQuestion.productId, productId))
		.orderBy(asc(TourBookingQuestion.sortOrder))
	return Response.json({ questions })
}

export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	const providerId = user ? await getProviderIdFromRequest(request, user) : null
	if (!providerId || !user?.id) return Response.json({ error: "unauthorized" }, { status: 401 })

	const parsed = payloadSchema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) {
		return Response.json(
			{ error: "validation_error", details: parsed.error.flatten() },
			{ status: 400 }
		)
	}
	const tour = await ownedTour(parsed.data.productId, providerId)
	if (!tour) return Response.json({ error: "not_found" }, { status: 404 })

	await db.transaction(async (tx) => {
		await tx
			.delete(TourBookingQuestion)
			.where(eq(TourBookingQuestion.productId, parsed.data.productId))
		if (parsed.data.questions.length) {
			await tx.insert(TourBookingQuestion).values(
				parsed.data.questions.map((question, sortOrder) => ({
					id: question.id,
					productId: parsed.data.productId,
					code: question.code,
					label: question.label,
					isRequired: question.required,
					sortOrder,
					createdAt: new Date(),
					updatedAt: new Date(),
				}))
			)
		}
	})
	await writeProviderAuditLog({
		providerId,
		actorUserId: user.id,
		action: "tour.booking_questions.updated",
		entityType: "Tour",
		entityId: parsed.data.productId,
		afterJson: { bookingQuestions: parsed.data.questions },
		riskLevel: "medium",
	})
	return Response.json({ ok: true, questions: parsed.data.questions })
}
