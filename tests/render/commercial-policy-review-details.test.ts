import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, it } from "vitest"
import Review from "@/components/admin/CommercialPolicyReviewDetails.astro"

const props = {
	country:"BO", collectionModel:"property_collect", jurisdictionRole:"product", draft:true,
	effectiveFrom:new Date("2026-11-09T00:00:00Z"),effectiveTo:null,
	context:{contextVersion:3,legalFormCodes:["BO:company"],executionModes:["team"],foodHandlingModes:["none"],transportProviders:[],experienceFormats:["guided_tour"],operatingRoles:["operator"],activityClasses:["urban_cultural"],jurisdictionCodes:["dept-la-paz"],composition:{kind:"admission",family:"platform_standards",requiredFamilies:["identity"],replacesVersionIds:[]}},
	territories:[{id:"dept-la-paz",name:"Departamento de La Paz"}],definitions:[],rules:[],
}
async function render(input = props) {
	return (await AstroContainer.create()).renderToString(Review,{props:input})
}
it("shows saved scope and provisional dates without granting activation",async()=>{
	const html=await render()
	expect(html).toContain("Sociedad comercial")
	expect(html).toContain("Departamento de La Paz")
	expect(html).toContain("El viajero paga al proveedor")
	expect(html).toContain("provisional, sin efecto en borrador")
	expect(html).toContain("Actividades no admitidas")
	expect(html).not.toContain("Registrar aprobación")
})
it("does not invent a default territory for an unresolved saved reference",async()=>{
	const html=await render({...props,territories:[]})
	expect(html).toContain("Territorio sin resolver")
	expect(html).not.toContain("Departamento de La Paz")
})
it("shows accepted definition version, subject and current insurance checklist",async()=>{
	const container=await AstroContainer.create()
	const html=await container.renderToString(Review,{props:{...props,definitions:[{id:"insurance-v2",key:"bo.tour.liability_insurance",label:"Responsabilidad civil",description:"Condiciones guardadas de esta version",version:2}],rules:[{id:"rule",required:true,conditionJson:{evidenceScope:"product",evidenceSubjectSelector:"guides"},capabilitiesJson:["publish","booking"],acceptedEvidenceJson:{version:1,alternatives:[{id:"package",allOf:[{definitionVersionId:"insurance-v2"}]}]},reviewOwner:"Revisor autorizado",sourceKind:"fastt_policy",sourceReference:"Referencia guardada",sourceCheckedAt:null}]}})
	expect(html).toContain("Responsabilidad civil · version 2")
	expect(html).toContain("Cada guia asignado")
	expect(html).toContain("Aceptar nuevas reservas")
	expect(html).toContain("Condiciones guardadas de esta version")
	expect(html).toContain("Criterios operativos actuales de revision")
	expect(html).toContain("Justificacion de suficiencia segun riesgos")
})
it("flags an invalid contract instead of presenting a valid admission",async()=>{
	const html=await render({...props,context:{...props.context,composition:{...props.context.composition,kind:"invalid"}}})
	expect(html).toContain("Contexto incompleto o invalido")
})
