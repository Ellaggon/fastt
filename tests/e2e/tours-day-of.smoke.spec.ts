import { expect, test } from "@playwright/test"

function todayIso() {
	return new Date().toISOString().slice(0, 10)
}

test.describe("B2 Playwright smoke — day-of queue check-in + voucher repair", () => {
	test("loads today's tour salidas and repairs issued voucher via check-in", async ({ page }) => {
		const today = todayIso()
		let checkInCalls = 0
		let queueVersion = 0

		await page.route("**/api/internal/provider-bookings-summary**", async (route) => {
			const issuedPending = queueVersion === 0
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					items: [
						{
							bookingId: "bkg_dayof_1",
							vertical: "tour",
							checkIn: today,
							departureTime: "09:30",
							guestName: "Ana Pérez",
							productName: "Mirador Andino",
							variantName: "Salida mañana",
							operationalStatus: issuedPending ? "checked_in" : "checked_in",
							checkedInAt: "2026-09-15T12:00:00.000Z",
							canCheckIn: issuedPending,
							voucher: { status: issuedPending ? "issued" : "redeemed" },
							lifecycleLabel: "En curso",
							opsCopy: { confirmArrivalAction: "Registrar presentación", guest: "participante" },
						},
						{
							bookingId: "bkg_dayof_2",
							vertical: "tour",
							checkIn: today,
							departureTime: "11:00",
							guestName: "Luis Soto",
							productName: "Mirador Andino",
							variantName: "Salida mediodía",
							operationalStatus: "pending_arrival",
							checkedInAt: null,
							canCheckIn: true,
							voucher: { status: "issued" },
							lifecycleLabel: "Por llegar",
							opsCopy: { confirmArrivalAction: "Registrar presentación", guest: "participante" },
						},
					],
				}),
			})
		})

		await page.route("**/api/booking/check-in", async (route) => {
			checkInCalls += 1
			const body = route.request().postDataJSON() as { bookingId?: string }
			expect(body.bookingId).toBeTruthy()
			queueVersion = 1
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					bookingId: body.bookingId,
					repaired: body.bookingId === "bkg_dayof_1",
					voucherStatus: "redeemed",
					operationalStatus: "checked_in",
				}),
			})
		})

		await page.goto("/tour-day-of-harness.html")

		await expect(page.getByRole("heading", { name: "Cola day-of" })).toBeVisible()
		await expect(page.locator("#dayOfSummary")).toContainText("2 salidas ordenadas por hora")
		await expect(page.locator("[data-booking-row=bkg_dayof_1]")).toContainText("09:30")
		await expect(page.locator("[data-booking-row=bkg_dayof_1]")).toContainText("Reparar voucher")
		await expect(page.locator("[data-booking-row=bkg_dayof_2]")).toContainText("11:00")
		await expect(page.locator("[data-booking-row=bkg_dayof_2]")).toContainText(
			"Registrar presentación"
		)

		await page.locator('[data-check-in="bkg_dayof_1"]').click()
		await expect.poll(() => checkInCalls).toBe(1)
		await expect(page.locator("[data-booking-row=bkg_dayof_1]")).toContainText("Listo")
		await expect(page.locator("[data-metric=Pendientes]")).toHaveText("1")
	})
})
