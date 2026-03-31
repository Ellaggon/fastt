declare module "@astrojs/db/dist/runtime/virtual.js" {
	// Minimal declaration to satisfy TypeScript in non-Astro contexts (e.g. `npm run check`).
	// Runtime behavior is provided by Astro/Vite; this file only prevents TS7016.
	export * from "@astrojs/db/runtime"
	export const sql: { raw(query: string): unknown }
}
