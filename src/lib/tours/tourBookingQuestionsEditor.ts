export const TOUR_QUESTION_LABELS = {
	pickup_location: "Dirección de recogida",
	language: "Idioma preferido",
	dietary: "Preferencias alimentarias",
	mobility: "Necesidades de movilidad",
	weight: "Peso para seguridad o equipamiento",
	height: "Altura para seguridad o equipamiento",
} as const

export type TourBookingQuestion = {
	id: string
	code: keyof typeof TOUR_QUESTION_LABELS | "custom"
	label: string
	required: boolean
}

export class BookingQuestionsRequestError extends Error {
	constructor(public readonly status: number) {
		super(
			status === 401
				? "Tu sesión venció. Inicia sesión para continuar."
				: "No pudimos confirmar las preguntas. Vuelve a intentarlo."
		)
	}
}

function parseQuestions(value: unknown): TourBookingQuestion[] {
	if (
		!Array.isArray(value) ||
		value.some(
			(item) =>
				!item ||
				typeof item.id !== "string" ||
				typeof item.label !== "string" ||
				typeof item.required !== "boolean" ||
				!(item.code === "custom" || Object.hasOwn(TOUR_QUESTION_LABELS, item.code))
		)
	)
		throw new Error("No se pudo leer la configuración de preguntas.")
	return value
}

/** Unknown server state cannot be saved as an empty configuration. */
export function createTourBookingQuestionsEditor(productId: string, request: typeof fetch = fetch) {
	let questions: TourBookingQuestion[] | null = null
	let pendingSave: Promise<TourBookingQuestion[]> | null = null
	return {
		get questions() {
			return questions
		},
		async load() {
			const response = await request(
				`/api/tours/booking-questions?${new URLSearchParams({ productId })}`,
				{
					signal: AbortSignal.timeout(15_000),
				}
			)
			if (!response.ok) throw new BookingQuestionsRequestError(response.status)
			const body = await response.json()
			questions = parseQuestions(body.questions)
			return questions
		},
		save(next: TourBookingQuestion[]): Promise<TourBookingQuestion[]> {
			if (!questions) return Promise.reject(new Error("Carga las preguntas antes de guardarlas."))
			if (pendingSave) return pendingSave
			pendingSave = (async () => {
				const response = await request("/api/tours/booking-questions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ productId, questions: next }),
					signal: AbortSignal.timeout(15_000),
				})
				if (!response.ok) throw new BookingQuestionsRequestError(response.status)
				const body = await response.json()
				if (body.ok !== true) throw new Error("No se pudo confirmar el guardado.")
				questions = parseQuestions(body.questions)
				return questions
			})().finally(() => {
				pendingSave = null
			})
			return pendingSave
		},
	}
}
