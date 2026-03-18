// import type { APIRoute } from "astro"
// import { db, PriceSeason } from "astro:db"
// import { randomUUID } from "node:crypto"

// export const POST: APIRoute = async ({ request }) => {
// 	try {
// 		const body = await request.json()

// 		const {
// 			variantId,
// 			name,
// 			type,
// 			value,
// 			startDate,
// 			endDate,
// 			validDays,
// 			isActive = true,
// 			priority = 0,
// 		} = body

// 		if (!name || !type || value === undefined) {
// 			return new Response(JSON.stringify({ error: "Datos incompletos" }), { status: 400 })
// 		}

// 		if (!["modifier", "percentage", "fixed"].includes(type)) {
// 			return new Response(JSON.stringify({ error: "Tipo inválido" }), { status: 400 })
// 		}

// 		if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
// 			return new Response(
// 				JSON.stringify({ error: "La fecha de inicio no puede ser mayor a la de fin" }),
// 				{ status: 400 }
// 			)
// 		}

// 		const priceSeasonId = randomUUID()

// 		await db.insert(PriceSeason).values({
// 			id: priceSeasonId,
// 			variantId,
// 			name,
// 			type,
// 			value,
// 			startDate: startDate ? new Date(startDate) : null,
// 			endDate: endDate ? new Date(endDate) : null,
// 			validDays: validDays?.length ? validDays : null,
// 			isActive,
// 			priority,
// 		})

// 		return new Response(JSON.stringify({ ok: true }))
// 	} catch (e) {
// 		return new Response(JSON.stringify({ error: "Error creando temporada" }), { status: 500 })
// 	}
// }
