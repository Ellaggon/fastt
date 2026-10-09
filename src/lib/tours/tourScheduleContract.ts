import { z } from "zod"

const date = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const parsed = new Date(`${value}T00:00:00Z`)
		return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
	}, "Selecciona una fecha válida")

export const tourScheduleSchema = z
	.object({
		variantId: z.string().min(1),
		from: date,
		to: date,
		weekdays: z.array(z.number().int().min(0).max(6)).min(1),
		excluded: z.array(date).max(366).default([]),
		capacity: z.number().int().min(1).max(100000),
	})
	.strict()
	.superRefine((input, ctx) => {
		const days = (Date.parse(input.to) - Date.parse(input.from)) / 86400000
		if (days < 0 || days > 365)
			ctx.addIssue({ code: "custom", path: ["to"], message: "Elige un periodo de hasta 366 días" })
		if (input.excluded.some((day) => day < input.from || day > input.to))
			ctx.addIssue({
				code: "custom",
				path: ["excluded"],
				message: "Las exclusiones deben pertenecer al periodo",
			})
	})
export type TourScheduleInput = z.infer<typeof tourScheduleSchema>
export type TourScheduleContext = {
	name: string
	time: string
	timezone: string
	today: string
	capacity: number
	mode: string
	version: string
}
export type TourSchedulePreview = {
	token: string
	context: TourScheduleContext
	newDates: string[]
	preservedDates: string[]
	blockedDates: string[]
}
export type TourScheduleResult = {
	createdDates: string[]
	preservedDates: string[]
	blockedDates: string[]
	refresh: "pending" | "ready"
}

export function scheduleDates(input: TourScheduleInput): string[] {
	const validated = tourScheduleSchema.parse(input)
	const excluded = new Set(validated.excluded)
	const days: string[] = []
	for (
		let cursor = Date.parse(validated.from);
		cursor <= Date.parse(validated.to);
		cursor += 86400000
	) {
		const date = new Date(cursor)
		const iso = date.toISOString().slice(0, 10)
		if (validated.weekdays.includes(date.getUTCDay()) && !excluded.has(iso)) days.push(iso)
	}
	return days
}
