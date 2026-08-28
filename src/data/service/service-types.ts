import { serviceIcons } from "@/data/service/service-icons"
import type { ServiceId } from "./service-registry"

export type ServiceCategory =
	| "Internet"
	| "Comidas y bebidas"
	| "Instalaciones"
	| "Estacionamiento y transporte"
	| "Servicios generales"
	| "Accesibilidad"
	| "Familias"
	| "Habitación"
	| "Negocios"
	| "Exteriores"
	| "Mascotas"
	| "Otros"

export type ServiceIcon = (typeof serviceIcons)[keyof typeof serviceIcons]

export interface ServiceDefinition {
	id: ServiceId
	category: ServiceCategory
	name: string
	description?: string
	icon: ServiceIcon
	defaultIncluded?: boolean
	isRoomAmenity?: boolean
}
