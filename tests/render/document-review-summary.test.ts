import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Summary from "@/components/admin/DocumentReviewSummary.astro"
import type { ProviderDocumentRecord } from "@/lib/provider-documents"

it("shows evidence facts and warns about missing scope without offering approval", async () => {
	const html = await (await AstroContainer.create()).renderToString(Summary, { props: { document: {
		typeLabel:"Credencial",fileName:"respaldo.pdf",subjectType:"person",issuer:"Emisor declarado",issuedAt:null,expiresAt:null,scopes:[],
	} as unknown as ProviderDocumentRecord } })
	expect(html).toContain("Persona registrada")
	expect(html).toContain("Emisor declarado")
	expect(html).toContain("Sin alcance declarado")
	expect(html).not.toContain("Verificar documento")
})
