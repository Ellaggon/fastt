import { safeVerificationReturn } from "@/lib/auth/returnTo"

/** Canonical experience editor destination; legacy verification URLs remain entry adapters. */
export function experienceRequirementsHref(productId: string, source?: URL): string {
	const target = new URL(`/product/${encodeURIComponent(productId)}`, "http://fastt.local")
	for (const key of ["type", "renewDocumentId", "result", "error"] as const) {
		const value = source?.searchParams.get(key)
		if (value) target.searchParams.set(key, value)
	}
	const returnTo = safeVerificationReturn(source?.searchParams.get("returnTo"))
	if (returnTo) target.searchParams.set("returnTo", returnTo)
	target.hash =
		source?.searchParams.get("tab") === "safety" ? "experience-safety" : "experience-requirements"
	return target.pathname + target.search + target.hash
}
