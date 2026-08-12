export type FiscalChannelCapabilities = {
	included: boolean
	excluded: boolean
	fixed: boolean
	percentage: boolean
	perGuest: boolean
	perNight: boolean
	seasons: boolean
	caps: boolean
	exemptions: boolean
	responsibility: boolean
}
export const fiscalChannelCapabilities: Record<string, FiscalChannelCapabilities> = {
	web: {
		included: true,
		excluded: true,
		fixed: true,
		percentage: true,
		perGuest: true,
		perNight: true,
		seasons: true,
		caps: true,
		exemptions: true,
		responsibility: true,
	},
	expedia: {
		included: true,
		excluded: true,
		fixed: true,
		percentage: true,
		perGuest: false,
		perNight: true,
		seasons: true,
		caps: false,
		exemptions: false,
		responsibility: true,
	},
	airbnb: {
		included: true,
		excluded: true,
		fixed: true,
		percentage: false,
		perGuest: true,
		perNight: true,
		seasons: false,
		caps: false,
		exemptions: false,
		responsibility: true,
	},
}
export function unsupportedFiscalFields(definition: any, channel: string) {
	const caps = fiscalChannelCapabilities[channel] ?? fiscalChannelCapabilities.web,
		rule = definition.jurisdictionJson ?? {},
		unsupported: string[] = []
	if (definition.inclusionType === "included" && !caps.included)
		unsupported.push("impuestos incluidos")
	if (definition.inclusionType === "excluded" && !caps.excluded)
		unsupported.push("impuestos excluidos")
	if (definition.calculationType === "fixed" && !caps.fixed) unsupported.push("cargo fijo")
	if (definition.calculationType === "percentage" && !caps.percentage)
		unsupported.push("cargo porcentual")
	if (["guest", "guest_night"].includes(definition.appliesPer) && !caps.perGuest)
		unsupported.push("por huésped")
	if (["night", "guest_night"].includes(definition.appliesPer) && !caps.perNight)
		unsupported.push("por noche")
	if (rule.seasons?.length && !caps.seasons) unsupported.push("temporadas")
	if ((rule.maxAmount || rule.maxNights) && !caps.caps) unsupported.push("topes")
	if (rule.exemptGuestResidenceCountries?.length && !caps.exemptions) unsupported.push("exenciones")
	if (rule.collectionResponsibility && !caps.responsibility)
		unsupported.push("responsable de recaudo")
	return unsupported
}
