import { getViteConfig } from "astro/config"
import path from "node:path"

export default getViteConfig(
	{
		test: {
			environment: "node",
			include: ["tests/render/**/*.test.ts"],
		},
		resolve: { alias: { "@": path.resolve("src") } },
	},
	{ configFile: false, integrations: [], output: "static" }
)
