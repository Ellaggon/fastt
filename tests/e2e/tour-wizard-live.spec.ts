import { expect, test } from "@playwright/test"

const enabled = process.env.PLAYWRIGHT_TOUR_WIZARD === "1"
const accessToken = process.env.PLAYWRIGHT_ACCESS_TOKEN ?? ""
const refreshToken = process.env.PLAYWRIGHT_REFRESH_TOKEN ?? ""
const geoPlaceId = process.env.PLAYWRIGHT_GEO_PLACE_ID ?? ""

test.describe("Tour wizard create, error, refresh and resume", () => {
	test.skip(!enabled || !accessToken || !refreshToken || !geoPlaceId)

	test.beforeEach(async ({ context, baseURL }) => {
		const origin = new URL(baseURL ?? "http://127.0.0.1:4321")
		await context.addCookies([
			{ name: "sb-access-token", value: accessToken, domain: origin.hostname, path: "/" },
			{ name: "sb-refresh-token", value: refreshToken, domain: origin.hostname, path: "/" },
		])
	})

	test("keeps launch-tour through submit, refresh, back and resumed submit", async ({ page }) => {
		let createCalls = 0
		await page.route("**/api/product/create", async (route) => {
			createCalls += 1
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: `00000000-0000-4000-8000-00000000000${createCalls}` }),
			})
		})
		await page.route("**/product/*/content**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<html><body><h1>Historia del tour</h1></body></html>",
			})
		})

		await page.goto("/product/create?type=Tour&playbook=launch-tour&step=create&flow=create")
		await expect(page.getByRole("heading", { name: /tour/i })).toBeVisible()
		await page.locator("#name").fill("Explora la ciudad a pie")
		await page.locator("#geoPlaceId").selectOption(geoPlaceId)
		await page.locator("#submitBtn").click()
		await expect(page).toHaveURL(/\/product\/[^/]+\/content\?playbook=launch-tour&step=content&flow=create/)

		await page.reload()
		await expect(page).toHaveURL(/playbook=launch-tour/)
		await page.goBack()
		await expect(page.locator("#createForm")).toBeVisible()
		await page.locator("#name").fill("Descubre el mercado local")
		await page.locator("#geoPlaceId").selectOption(geoPlaceId)
		await page.locator("#submitBtn").click()
		await expect.poll(() => createCalls).toBe(2)
	})

	test("focuses a server field error and remains inside the wizard", async ({ page }) => {
		await page.route("**/api/product/create", async (route) => {
			await route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({
					error: "validation_error",
					details: { fieldErrors: { geoPlaceId: ["Selecciona un destino válido."] } },
				}),
			})
		})
		await page.goto("/product/create?type=Tour&playbook=launch-tour&step=create&flow=create")
		await page.locator("#name").fill("Tour con destino inválido")
		await page.locator("#geoPlaceId").selectOption({ index: 1 })
		await page.locator("#submitBtn").click()
		await expect(page.locator("#destinationError")).toContainText("Selecciona un destino válido")
		await expect(page.locator("#geoPlaceId")).toBeFocused()
		await expect(page).toHaveURL(/playbook=launch-tour/)
	})
})
