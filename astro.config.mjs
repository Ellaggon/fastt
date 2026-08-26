import { defineConfig, passthroughImageService } from "astro/config"
import vercel from "@astrojs/vercel"
import node from "@astrojs/node"
import dotenv from "dotenv"
import path from "path"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"

// Astro's defineConfig is identity: it does not invoke a ({ mode }) factory the
// way Vite does. Exporting a function hid `adapter`/`output` and broke `astro
// build` (NoAdapterInstalled) in CI and Vercel. Keep a static config object.
dotenv.config()

const isVercel = process.env.VERCEL === "1"
const reactDevelopmentRuntime = {
	name: "fastt:react-development-runtime",
	configResolved(config) {
		if (config.command !== "serve") return
		config.optimizeDeps.esbuildOptions ??= {}
		config.optimizeDeps.esbuildOptions.define = {
			...config.optimizeDeps.esbuildOptions.define,
			"process.env.NODE_ENV": JSON.stringify("development"),
		}
	},
}

// https://astro.build/config
export default defineConfig({
	integrations: [react()],
	site: "https://fastt-five.vercel.app",
	output: "server",
	adapter: isVercel ? vercel() : node({ mode: "standalone" }),
	image: {
		service: passthroughImageService(),
	},
	vite: {
		plugins: [reactDevelopmentRuntime, tailwindcss()],
		optimizeDeps: {
			include: ["zod"],
		},
		resolve: {
			alias: {
				"@": path.resolve("./src"),
			},
		},
	},
})
