import { expect, test, type Page } from "@playwright/test"

async function mockHoldSuccess(page: Page) {
	await page.route("**/api/inventory/hold", async (route) => {
		const body = route.request().postDataJSON() as Record<string, unknown>
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
				holdId: "hold_smoke_1",
				request: body,
			}),
		})
	})
}

test.describe("B1 Playwright smoke — PDP trust + ticket→price→hold", () => {
	test("renders trust copy, age-band price, and holds cupo after tariff select", async ({
		page,
	}) => {
		const holdBodies: Array<Record<string, unknown>> = []
		await page.route("**/api/inventory/hold", async (route) => {
			const body = route.request().postDataJSON() as Record<string, unknown>
			holdBodies.push(body)
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, holdId: "hold_smoke_1" }),
			})
		})

		await page.goto("/tour-pdp-harness.html")

		await expect(page.getByText("reseñas publicadas")).toBeVisible()
		await expect(page.getByText("Punto de encuentro")).toBeVisible()
		await expect(page.getByText("Itinerario")).toBeVisible()
		await expect(page.getByText("Desglose por age band")).toBeVisible()
		await expect(page.locator("[data-ticket-qty=adult]")).toHaveValue("2")
		await expect(page.locator("[data-ticket-qty=child]")).toHaveValue("1")
		await expect(page.locator("[data-price-total]")).toContainText("240")
		await expect(page.locator("[data-cupo]")).toContainText("cupo 3")

		await page.locator("[data-ticket-qty=adult]").fill("3")
		await page.locator("[data-ticket-qty=child]").fill("0")
		await page.getByRole("button", { name: "Actualizar precio" }).click()
		await expect(page.locator("[data-price-total]")).toContainText("300")
		await expect(page.locator("[data-cupo]")).toContainText("cupo 3")
		await expect(page.locator("#tourHoldStatus")).toContainText("Precio actualizado")

		await page.getByRole("button", { name: /Tarifa estándar/ }).click()
		await expect(page.locator("#tourHoldStatus")).toContainText("Tarifa seleccionada")
		await expect(page.locator("#tourReserveBtn")).toBeEnabled()

		await page.getByRole("button", { name: "Reservar cupo" }).click()
		await expect(page.locator("#tourHoldStatus")).toContainText("Cupo reservado")
		await expect(page.locator("#tourConfirmBtn")).toBeEnabled()

		expect(holdBodies).toHaveLength(1)
		expect(holdBodies[0]).toMatchObject({
			variantId: "var_smoke",
			ratePlanId: "rp_smoke",
			occupancyDetail: { adults: 3, children: 0, infants: 0 },
			rooms: 3,
		})
		expect(holdBodies[0]?.dateRange).toMatchObject({
			from: "2026-09-15",
			to: "2026-09-16",
		})
	})

	test("surfaces not_holdable cupo error from hold API", async ({ page }) => {
		await page.route("**/api/inventory/hold", async (route) => {
			await route.fulfill({
				status: 409,
				contentType: "application/json",
				body: JSON.stringify({ error: "not_holdable" }),
			})
		})

		await page.goto("/tour-pdp-harness.html")
		await page.getByRole("button", { name: /Tarifa estándar/ }).click()
		await page.getByRole("button", { name: "Reservar cupo" }).click()
		await expect(page.locator("#tourHoldStatus")).toContainText("No hay cupo suficiente")
		await expect(page.locator("#tourConfirmBtn")).toBeDisabled()
	})
})

test.describe("B1 optional live PDP", () => {
	test.skip(!process.env.PLAYWRIGHT_TOUR_ID, "Set PLAYWRIGHT_TOUR_ID + PLAYWRIGHT_BASE_URL for live")

	test("live host shows trust/booking rail selectors", async ({ page }) => {
		const tourId = String(process.env.PLAYWRIGHT_TOUR_ID)
		await mockHoldSuccess(page)
		await page.goto(`/tours/${encodeURIComponent(tourId)}`)
		await expect(page.locator("[data-tour-booking-root]")).toBeVisible({ timeout: 20_000 })
		await expect(
			page.getByText(/reseñas publicadas|Aún sin reseñas publicadas/)
		).toBeVisible()
		await expect(page.locator("[data-ticket-qty]").first()).toBeVisible()
	})
})
