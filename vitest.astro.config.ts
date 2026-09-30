import { getViteConfig } from "astro/config"
import path from "node:path"

export default getViteConfig(
	{
		test: {
			environment: "node",
			include: ["tests/render/**/*.test.ts"],
			setupFiles: [path.resolve("tests/setup/clean-db-env.ts")],
		},
		resolve: { alias: { "@": path.resolve("src") } },
	},
	{ configFile: false, integrations: [], output: "static" }
)
