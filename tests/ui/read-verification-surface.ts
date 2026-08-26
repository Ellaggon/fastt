import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

const extras = [
	"src/components/provider/ProviderVerificationWorkspace.astro",
	"src/lib/provider-verification-workspace.ts",
	"src/lib/provider-verification-trust-snapshot.ts",
] as const

function readFile(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

/** Page + shared 4-tab workspace so source-scan tests still see panel markup and loaders. */
export function readVerificationSurface(pageRelative: string) {
	return [pageRelative, ...extras].map(readFile).join("\n")
}
