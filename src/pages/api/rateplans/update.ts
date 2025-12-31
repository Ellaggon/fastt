import type { APIRoute } from "astro"
import { db, RatePlan, eq } from "astro:db"

const ALLOWED_TYPES = ["modifier", "fixed", "package", "percentage"] as const

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()
		const id = body.id

		if (!id) {
			return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
		}

		// ---- BASIC VALIDATIONS ----
		if (!body.name || typeof body.name !== "string") {
			return new Response(JSON.stringify({ error: "Nombre requerido" }), { status: 400 })
		}

		if (!ALLOWED_TYPES.includes(body.type)) {
			return new Response(JSON.stringify({ error: "Tipo inválido" }), { status: 400 })
		}

		// ---- DATE VALIDATION ----
		if (body.startDate && body.endDate) {
			const start = new Date(body.startDate)
			const end = new Date(body.endDate)

			if (end < start) {
				return new Response(
					JSON.stringify({ error: "La fecha fin debe ser mayor a la fecha inicio" }),
					{ status: 400 }
				)
			}
		}

		// ---- STAY & ADVANCE VALIDATION ----
		if (body.maxNights && body.maxNights < body.minNights) {
			return new Response(JSON.stringify({ error: "maxNights no puede ser menor que minNights" }), {
				status: 400,
			})
		}

		if (body.maxAdvanceDays && body.maxAdvanceDays < body.minAdvanceDays) {
			return new Response(
				JSON.stringify({ error: "maxAdvanceDays no puede ser menor que minAdvanceDays" }),
				{ status: 400 }
			)
		}

		// ---- NORMALIZE VALUES ----
		let valueUSD = Number(body.valueUSD ?? 0)
		let valueBOB = Number(body.valueBOB ?? 0)

		// ---- TYPE RULES ----
		switch (body.type) {
			case "package":
				// No modifica precios
				valueUSD = 0
				valueBOB = 0
				break

			case "fixed":
				// Reemplaza precio → no negativos
				if (valueUSD < 0 || valueBOB < 0) {
					return new Response(JSON.stringify({ error: "El precio fijo no puede ser negativo" }), {
						status: 400,
					})
				}
				break

			case "percentage":
				// Porcentaje de descuento
				if (valueUSD < 0 || valueUSD > 100 || valueBOB < 0 || valueBOB > 100) {
					return new Response(JSON.stringify({ error: "El porcentaje debe estar entre 0 y 100" }), {
						status: 400,
					})
				}
				// Normalizamos (nunca negativo)
				valueUSD = Math.abs(valueUSD)
				valueBOB = Math.abs(valueBOB)
				break

			case "modifier":
				// Puede ser negativo o positivo → OK
				break
		}

		// ---- VALID DAYS ----
		let validDays = null
		if (Array.isArray(body.validDays) && body.validDays.length > 0) {
			validDays = body.validDays
		}

		// ---- UPDATE ----
		await db
			.update(RatePlan)
			.set({
				name: body.name,
				description: body.description ?? null,

				type: body.type,
				valueUSD,
				valueBOB,

				refundable: Boolean(body.refundable),
				cancellationPolicyId: body.cancellationPolicyId ?? null,
				paymentType: body.paymentType ?? "Prepaid",

				minNights: Number(body.minNights ?? 1),
				maxNights: body.maxNights ? Number(body.maxNights) : null,

				minAdvanceDays: Number(body.minAdvanceDays ?? 0),
				maxAdvanceDays: body.maxAdvanceDays ? Number(body.maxAdvanceDays) : null,

				validDays,

				startDate: body.startDate ? new Date(body.startDate) : null,
				endDate: body.endDate ? new Date(body.endDate) : null,

				isActive: Boolean(body.isActive),
			})
			.where(eq(RatePlan.id, id))

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (e) {
		console.error("rateplans:update", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
