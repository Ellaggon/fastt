export type DocumentTechnicalState = {
	processingState: string
	structuralStatus: string
	malwareStatus: string
	tamperStatus: string
}

export function documentTechnicalPresentation(state?: DocumentTechnicalState | null) {
	const ready =
		state?.processingState === "completed" &&
		state.structuralStatus === "valid" &&
		state.malwareStatus === "clean" &&
		["clear", "inconclusive"].includes(state.tamperStatus)
	if (ready)
		return {
			ready: true,
			label: "Pendiente de revisión",
			message:
				"Comprobación técnica completada. Falta revisar la validez y cobertura del documento.",
		}
	if (
		state?.processingState === "blocked" ||
		state?.malwareStatus === "infected" ||
		state?.tamperStatus === "suspected"
	)
		return {
			ready: false,
			label: "Archivo en cuarentena",
			message: "El archivo no superó la comprobación técnica. No puede abrirse ni aprobarse.",
		}
	if (["failed", "awaiting_configuration"].includes(state?.processingState ?? ""))
		return {
			ready: false,
			label: "Comprobación pendiente de Fastt",
			message:
				"Fastt debe completar la comprobación técnica. No necesitas reenviar el documento mientras se resuelve.",
		}
	return {
		ready: false,
		label: "Comprobando archivo",
		message:
			"Archivo recibido. La revisión documental comenzará cuando termine la comprobación técnica.",
	}
}
