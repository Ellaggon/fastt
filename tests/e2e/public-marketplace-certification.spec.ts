import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const enabled = process.env.PLAYWRIGHT_PUBLIC_CERTIFICATION === "1"
const publicRoutes = (process.env.PLAYWRIGHT_PUBLIC_ROUTES ??
	"/,/hotels,/tours,/destinos/la-paz/alojamientos,/destinos/la-paz/tours")
	.split(",")
	.map((route) => route.trim())
	.filter(Boolean)
const viewports = [
	{ width: 390, height: 844 },
	{ width: 768, height: 1024 },
	{ width: 1280, height: 900 },
	{ width: 1440, height: 1000 },
]

test.describe("certificación pública de marketplace", () => {
	test.skip(!enabled, "Set PLAYWRIGHT_PUBLIC_CERTIFICATION=1 with a development or preview URL")

	test("mantiene metadata, JSON-LD, navegación y accesibilidad básica", async ({ page }) => {
		for (const route of publicRoutes) {
			await page.goto(route, { waitUntil: "networkidle" })
			await expect(page.locator("main")).toBeVisible()
			await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
			await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
			const violations = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
			expect(violations.violations).toEqual([])
		}
	})

	test("no produce desborde horizontal en los tamaños certificados", async ({ page }) => {
		for (const viewport of viewports) {
			await page.setViewportSize(viewport)
			for (const route of publicRoutes) {
				await page.goto(route, { waitUntil: "networkidle" })
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - document.documentElement.clientWidth
				)
				expect(overflow, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(1)
			}
		}
	})

	test("muestra una alternativa cuando la imagen principal no carga", async ({ page }) => {
		await page.route("**/la-paz.webp", (route) => route.abort("failed"))
		await page.goto("/", { waitUntil: "networkidle" })
		await expect(page.getByLabel("Imagen no disponible")).toBeVisible()
	})

	test("mantiene el contenido de la portada disponible con una imagen lenta", async ({ page }) => {
		await page.route("**/la-paz.webp", async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 900))
			await route.abort("failed")
		})
		await page.goto("/", { waitUntil: "domcontentloaded" })
		await expect(page.locator("main")).toBeVisible()
		await expect(page.getByRole("link", { name: /alojamientos/i }).first()).toBeVisible()
	})
})
