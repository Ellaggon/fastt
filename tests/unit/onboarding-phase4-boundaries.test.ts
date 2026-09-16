import { describe, expect, it } from "vitest"

import {
	activeProductVerticals,
	getProductVerticalEntry,
	productVerticalRegistry,
} from "@/lib/catalog/productVerticalRegistry"
import {
	resolveProviderWorkspaceContext,
	resolveWorkspaceScopeOptions,
} from "@/lib/workspace/verticalContext"
import { requiredKycDocumentTypes } from "@/lib/provider-documents"

describe("onboarding phase 4 boundaries", () => {
	it("keeps mixed providers inside their selected vertical without inventing cross-vertical operations", () => {
		expect(
		resolveProviderWorkspaceContext({ productTypes: ["Hotel", "Tour"], vertical: "tour" })
	).toMatchObject({ level: "vertical", vertical: "tour", availableVerticals: ["hotel", "tour"] })
		expect(
		resolveWorkspaceScopeOptions({ productTypes: ["Hotel", "Tour"], canAccessWorkspace: true })
	).toEqual([
		{ vertical: "hotel", label: "Alojamientos" },
		{ vertical: "tour", label: "Tours" },
	])
	})

	it("activates rental only with its distinct exclusive-inventory contract", () => {
		const rental = getProductVerticalEntry("rental")
		expect(rental.status).toBe("active")
		expect(rental.productType).toBe("whole_home")
		expect(rental.variantKind).toBe("whole_home")
		expect(rental.routes.publicCollectionHref).toBe("/homes")
		expect(activeProductVerticals).toContain("rental")
		expect(productVerticalRegistry.rental.creation.submitLabel).toContain("vivienda")
	})

	it("does not claim adaptive KYC while the approved policy remains global", () => {
		expect(requiredKycDocumentTypes).toEqual([
		"government_id",
		"business_registration",
		"tax_document",
	])
	})
})
