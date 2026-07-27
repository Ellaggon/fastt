import { describe, expect, it } from "vitest"

import {
	parseExternalCalendarEvents,
	validateExternalCalendarUrl,
} from "@/lib/provider-external-calendars"

describe("provider external calendars", () => {
	it("accepts public https feeds and rejects unsafe destinations", () => {
		expect(validateExternalCalendarUrl("https://calendar.example.com/feed.ics").hostname).toBe(
			"calendar.example.com"
		)
		expect(() => validateExternalCalendarUrl("http://calendar.example.com/feed.ics")).toThrow(
			"ICAL_URL_HTTPS_REQUIRED"
		)
		expect(() => validateExternalCalendarUrl("https://localhost/feed.ics")).toThrow(
			"ICAL_URL_PRIVATE_HOST"
		)
		expect(() => validateExternalCalendarUrl("https://192.168.1.4/feed.ics")).toThrow(
			"ICAL_URL_PRIVATE_HOST"
		)
	})

	it("parses all-day stays, recurring events and exclusions within the import window", async () => {
		const events = await parseExternalCalendarEvents(
			[
				"BEGIN:VCALENDAR",
				"VERSION:2.0",
				"PRODID:-//Fastt Test//EN",
				"BEGIN:VEVENT",
				"UID:single@example.test",
				"DTSTAMP:20260701T000000Z",
				"DTSTART;VALUE=DATE:20260720",
				"DTEND;VALUE=DATE:20260723",
				"SUMMARY:Reserved",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"UID:recurring@example.test",
				"DTSTAMP:20260701T000000Z",
				"DTSTART;VALUE=DATE:20260801",
				"DTEND;VALUE=DATE:20260802",
				"RRULE:FREQ=DAILY;COUNT=3",
				"EXDATE;VALUE=DATE:20260802",
				"SUMMARY:Blocked",
				"END:VEVENT",
				"BEGIN:VEVENT",
				"UID:cancelled@example.test",
				"DTSTAMP:20260701T000000Z",
				"DTSTART;VALUE=DATE:20260810",
				"DTEND;VALUE=DATE:20260811",
				"STATUS:CANCELLED",
				"SUMMARY:Cancelled",
				"END:VEVENT",
				"END:VCALENDAR",
			].join("\r\n"),
			{ now: new Date("2026-07-15T12:00:00.000Z") }
		)

		expect(events.map((event) => [event.externalUid, event.startDate, event.endDate])).toEqual([
			["single@example.test", "2026-07-20", "2026-07-23"],
			["recurring@example.test", "2026-08-01", "2026-08-02"],
			["recurring@example.test", "2026-08-03", "2026-08-04"],
		])
		expect(events.every((event) => event.fingerprint.length === 64)).toBe(true)
	})

	it("rejects responses that are not iCalendar documents", async () => {
		await expect(parseExternalCalendarEvents("<html>login required</html>")).rejects.toThrow(
			"ICAL_CONTENT_INVALID"
		)
	})
})
