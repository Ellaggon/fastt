import { expect, it } from "vitest"
import { scheduleDates, tourScheduleSchema } from "@/lib/tours/tourScheduleContract"
const input = {
	variantId: "option",
	from: "2027-01-01",
	to: "2027-01-14",
	weekdays: [1, 4],
	excluded: [],
	capacity: 8,
}
it("materializes only selected weekdays within an inclusive period", () => {
	expect(scheduleDates(input)).toEqual(["2027-01-04", "2027-01-07", "2027-01-11", "2027-01-14"])
})
it("excludes dates without changing recurrence", () => {
	expect(scheduleDates({ ...input, excluded: ["2027-01-07"] })).toEqual([
		"2027-01-04",
		"2027-01-11",
		"2027-01-14",
	])
})
it("supports a single date and an empty matching result", () => {
	expect(scheduleDates({ ...input, from: "2027-01-04", to: "2027-01-04" })).toEqual(["2027-01-04"])
	expect(scheduleDates({ ...input, from: "2027-01-05", to: "2027-01-05" })).toEqual([])
})
it("rejects impossible dates, absent weekdays, unknown weekdays and excessive ranges", () => {
	for (const change of [
		{ from: "2027-02-31" },
		{ weekdays: [] },
		{ weekdays: [8] },
		{ to: "2029-01-01" },
		{ excluded: ["2026-12-31"] },
	])
		expect(tourScheduleSchema.safeParse({ ...input, ...change }).success).toBe(false)
})
