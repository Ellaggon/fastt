import { defineConfig, passthroughImageService } from "astro/config"
import tailwind from "@astrojs/tailwind"
import auth from "auth-astro"
import vercel from "@astrojs/vercel"
import node from "@astrojs/node"
import db from "@astrojs/db"
import dotenv from "dotenv"

dotenv.config()

const isVercel = process.env.VERCEL === "1"

// https://astro.build/config
export default defineConfig({
	integrations: [tailwind(), auth(), db()],
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
})
