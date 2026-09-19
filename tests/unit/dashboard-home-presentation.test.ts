import { describe, expect, it } from "vitest"

import {
	filterProductsForWorkspaceScope,
	isDashboardSetupHome,
	resolveDashboardHomeCopy,
	summarizeDashboardToday,
} from "@/lib/dashboard/dashboardHomePresentation"

describe("dashboard home presentation", () => {
	it("lists only the scoped vertical", () => {
		const products = [
			{ id: "t1", type: "Tour" },
			{ id: "h1", type: "Hotel" },
		]
		expect(filterProductsForWorkspaceScope(products, "tour").map((product) => product.id)).toEqual([
			"t1",
		])
		expect(filterProductsForWorkspaceScope(products, null)).toHaveLength(2)
	})

	it("treats unpublished listings as a setup home", () => {
		const products = [{ id: "t1", type: "tour" }]
		const preparation = new Map([
			["t1", { isPublished: false, readyToPublish: false, blockerCount: 3 }],
		])
		expect(isDashboardSetupHome(products, preparation)).toBe(true)
		expect(
			isDashboardSetupHome(products, new Map([["t1", { isPublished: true, readyToPublish: false }]]))
		).toBe(false)
	})

	it("uses a setup heading for a single unfinished tour", () => {
		expect(
			resolveDashboardHomeCopy({
				isChoosingForAddRoom: false,
				isSetupHome: true,
				hasHotel: false,
				hasTour: true,
				hotelCount: 0,
				tourCount: 1,
				productCount: 1,
			})
		).toMatchObject({
			title: "Prepara tu tour",
		})
		expect(
			resolveDashboardHomeCopy({
				isChoosingForAddRoom: false,
				isSetupHome: false,
				hasHotel: false,
				hasTour: true,
				hotelCount: 0,
				tourCount: 1,
				productCount: 1,
				hasTodayOperations: true,
			}).title
		).toBe("Hoy")
	})

	it("summarizes today's operational attention, ignoring cancelled bookings", () => {
		const summary = summarizeDashboardToday(
			[
				{
					bookingId: "a",
					guestName: "Ana",
					productName: "Tour centro",
					checkIn: "2026-09-18",
					checkOut: "2026-09-18",
					lifecycleState: "upcoming_arrival",
					payment: { pendingAmount: 20 },
				},
				{
					bookingId: "b",
					guestName: "Bruno",
					productName: "Hotel",
					checkIn: "2026-09-17",
					checkOut: "2026-09-19",
					lifecycleState: "in_house",
					payment: { pendingAmount: 0 },
				},
				{
					bookingId: "c",
					checkIn: "2026-09-18",
					lifecycleState: "cancelled",
					payment: { pendingAmount: 99 },
				},
			],
			"2026-09-18"
		)
		expect(summary).toMatchObject({
			hasAnyBookings: true,
			arrivalsToday: 1,
			departuresToday: 1,
			inProgress: 1,
			pendingPayment: 1,
		})
		expect(summary.agenda.map((item) => item.bookingId)).toEqual(["a", "b"])
		expect(
			summarizeDashboardToday(
				[{ bookingId: "c", checkIn: "2026-09-18", lifecycleState: "cancelled" }],
				"2026-09-18"
			).hasAnyBookings
		).toBe(false)
	})
})
