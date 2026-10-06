import { z } from "zod"

export const tourPresentationSchema = z
	.object({
		productId: z.string().uuid(),
		mode: z.enum(["create", "edit"]),
		name: z
			.string()
			.trim()
			.min(1, "Escribe el nombre del tour.")
			.max(200, "Usa hasta 200 caracteres para el nombre."),
		geoPlaceId: z.string().trim().min(1, "Selecciona un destino."),
		description: z
			.string()
			.trim()
			.max(20000, "Usa hasta 20.000 caracteres para la descripción.")
			.default(""),
		highlights: z
			.array(z.string().trim().min(1).max(500, "Usa hasta 500 caracteres por destacado."))
			.max(30, "Selecciona o escribe hasta 30 elementos."),
		categoryIds: z
			.array(z.string().trim().min(1))
			.max(30, "Selecciona o escribe hasta 30 elementos."),
		intent: z.enum(["continue", "exit"]).default("continue"),
	})
	.superRefine((input, context) => {
		if (input.intent === "exit") return
		for (const [path, valid, message] of [
			["description", Boolean(input.description), "Describe la experiencia."],
			["highlights", input.highlights.length > 0, "Añade al menos un destacado."],
			["categoryIds", input.categoryIds.length > 0, "Selecciona al menos un tipo de experiencia."],
		] as const) {
			if (!valid) context.addIssue({ code: "custom", path: [path], message })
		}
	})

export type TourPresentationInput = z.infer<typeof tourPresentationSchema>
export type TourPresentationCommand = TourPresentationInput & {
	providerId: string
	actorId: string
}
export interface TourPresentationRepositoryPort {
	saveTourPresentation(input: TourPresentationCommand): Promise<void>
}

export class TourPresentationError extends Error {
	constructor(
		public readonly code: string,
		public readonly status: number,
		public readonly field?: string
	) {
		super(code)
	}
}

export async function saveTourPresentation(
	deps: { repo: TourPresentationRepositoryPort },
	input: unknown,
	actor: { providerId: string; actorId: string }
) {
	const parsed = tourPresentationSchema.parse(input)
	await deps.repo.saveTourPresentation({
		...parsed,
		...actor,
		categoryIds: [...new Set(parsed.categoryIds)],
	})
	return { productId: parsed.productId }
}
