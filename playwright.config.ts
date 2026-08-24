import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:4177"
const useBrave = process.env.PLAYWRIGHT_BROWSER === "brave"
const braveExecutablePath =
	process.env.PLAYWRIGHT_BRAVE_EXECUTABLE?.trim() ||
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	timeout: 45_000,
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		useBrave
			? {
					name: "brave",
					use: {
						...devices["Desktop Chrome"],
						launchOptions: { executablePath: braveExecutablePath },
					},
				}
			: {
					name: "chromium",
					use: { ...devices["Desktop Chrome"] },
				},
	],
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: "node tests/e2e/serve-fixtures.mjs",
				url: "http://127.0.0.1:4177/health",
				reuseExistingServer: !process.env.CI,
				timeout: 30_000,
			},
})
