import { defineConfig, passthroughImageService } from "astro/config"
import tailwind from "@astrojs/tailwind"
import vercel from "@astrojs/vercel"
import node from "@astrojs/node"
import db from "@astrojs/db"
import dotenv from "dotenv"
import path from "path"
import react from "@astrojs/react"

dotenv.config()

const isVercel = process.env.VERCEL === "1"

// https://astro.build/config
export default defineConfig({
	integrations: [tailwind(), db(), react()],
	db: {
		connection: {
			client: "@libsql/client",
			url: process.env.ASTRO_DB_REMOTE_URL,
			authToken: process.env.ASTRO_DB_APP_TOKEN,
		},
	},
	output: "server",
	adapter: isVercel ? vercel() : node({ mode: "standalone" }),
	image: {
		service: passthroughImageService(),
	},
	vite: {
		optimizeDeps: {
			disabled: false,
			force: true,
			include: ["zod"],
		},
		resolve: {
			alias: {
				"@": path.resolve("./src"),
			},
		},
	},
})
