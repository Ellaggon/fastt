type AttrMap = Record<string, string | undefined>

export function generateOtaText(serviceId: string, attrs: AttrMap): string {
	switch (serviceId) {
		case "wifi": {
			const speed = attrs.speed ? `${attrs.speed}` : "Wi-Fi"
			const coverage =
				attrs.coverage === "entire_property"
					? "en todo el establecimiento"
					: attrs.coverage === "common"
						? "en las áreas comunes"
						: "en las habitaciones"

			return `${speed} disponible ${coverage}.`
		}

		case "parking": {
			return `Estacionamiento ${
				attrs.covered === "true" ? "cubierto" : "disponible"
			} para huéspedes.`
		}

		default:
			return ""
	}
}
