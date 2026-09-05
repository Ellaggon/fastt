export type HolderNameMatchLevel = "exact" | "probable" | "mismatch" | "insufficient"

export type HolderNameMatch = {
	level: HolderNameMatchLevel
	score: number
	method: string
	detail: string
}

const LEGAL_FORM_TOKENS = new Set([
	"sa",
	"srl",
	"srls",
	"ltda",
	"ltd",
	"llc",
	"inc",
	"corp",
	"plc",
	"gmbh",
	"sas",
	"spa",
	"sociedad",
	"anonima",
	"limitada",
	"company",
	"co",
])

function normalizedTokens(value: string | null | undefined) {
	return (
		String(value ?? "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLocaleLowerCase("es")
			// Legal forms are frequently entered as S.R.L., S R L or S/R/L. Remove
			// the complete form before punctuation is converted into individual tokens.
			.replace(
				/\b(?:s\s*[./-]?\s*r\s*[./-]?\s*l|s\s*[./-]?\s*a|l\s*[./-]?\s*t\s*[./-]?\s*d\s*[./-]?\s*a?)\b/g,
				" "
			)
			.replace(/[^a-z0-9]+/g, " ")
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.filter((token) => !LEGAL_FORM_TOKENS.has(token))
	)
}

function levenshteinSimilarity(left: string, right: string) {
	if (left === right) return 1
	if (!left || !right) return 0
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		let diagonal = previous[0]
		previous[0] = leftIndex
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const beforeUpdate = previous[rightIndex]
			previous[rightIndex] = Math.min(
				previous[rightIndex] + 1,
				previous[rightIndex - 1] + 1,
				diagonal + Number(left[leftIndex - 1] !== right[rightIndex - 1])
			)
			diagonal = beforeUpdate
		}
	}
	return 1 - previous[right.length] / Math.max(left.length, right.length)
}

/**
 * Conservative, explainable holder-name comparison for payout review.
 *
 * It removes common legal forms, tolerates ordering and a small typo, but
 * deliberately never treats an approximate result as automatic proof.
 */
export function assessHolderNameMatch(params: {
	legalName: string | null | undefined
	accountHolderName: string | null | undefined
}): HolderNameMatch {
	const legalTokens = normalizedTokens(params.legalName)
	const holderTokens = normalizedTokens(params.accountHolderName)
	if (!legalTokens.length || !holderTokens.length)
		return {
			level: "insufficient",
			score: 0,
			method: "Datos insuficientes",
			detail: "Falta la razón social o el titular de la cuenta para compararlos.",
		}

	const legalFingerprint = [...legalTokens].sort().join(" ")
	const holderFingerprint = [...holderTokens].sort().join(" ")
	if (legalFingerprint === holderFingerprint)
		return {
			level: "exact",
			score: 1,
			method: "Coincidencia normalizada exacta",
			detail:
				"Razón social y titular coinciden tras normalizar acentos, puntuación y forma societaria.",
		}

	const legalSet = new Set(legalTokens)
	const holderSet = new Set(holderTokens)
	const shared = [...legalSet].filter((token) => holderSet.has(token)).length
	const coverage = shared / Math.max(legalSet.size, holderSet.size)
	const similarity = levenshteinSimilarity(legalFingerprint, holderFingerprint)
	const score = Number((coverage * 0.55 + similarity * 0.45).toFixed(3))
	if ((coverage >= 0.8 && similarity >= 0.82) || (coverage >= 0.6 && similarity >= 0.91))
		return {
			level: "probable",
			score,
			method: "Coincidencia probable; revisión humana requerida",
			detail:
				"Los nombres comparten la mayor parte de sus términos, pero existe una variación que debe justificarse antes de aprobar.",
		}

	return {
		level: "mismatch",
		score,
		method: "Discrepancia de titularidad",
		detail:
			"La razón social y el titular no alcanzan el umbral conservador de coincidencia. No apruebes sin evidencia adicional o una excepción autorizada.",
	}
}
