import { serviceIcons } from "@/data/service/service-icons"

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
	id: string
	category: ServiceCategory
	name: string
	description?: string
	defaultFree?: boolean
	icon: ServiceIcon
}
