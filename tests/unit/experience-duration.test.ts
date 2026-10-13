import { expect, it } from "vitest"
import {
	experienceDurationLabel,
	experienceDurationMinutes,
} from "@/shared/domain/experience-duration"
it.each([
	[0, 30, 30],
	[1, 30, 90],
	[2, 0, 120],
])("computes %s hours and %s minutes", (hours, minutes, expected) => {
	expect(experienceDurationMinutes(hours, minutes)).toBe(expected)
})
it.each([
	[-1, 0],
	[0, 60],
	[1.5, 0],
	[1, -1],
])("rejects invalid duration %s:%s", (hours, minutes) => {
	expect(experienceDurationMinutes(hours, minutes)).toBeNaN()
})
it("generates a single readable duration", () => {
	expect(experienceDurationLabel(90)).toBe("1 hora 30 min")
	expect(experienceDurationLabel(120)).toBe("2 horas")
})
