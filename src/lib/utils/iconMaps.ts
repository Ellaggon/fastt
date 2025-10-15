import {
	Beer,
	Bus,
	Car,
	CircleParking,
	Coffee,
	Dumbbell,
	HeartPulse,
	PawPrint,
	Shirt,
	Tent,
	Umbrella,
	Utensils,
	Waves,
	Wifi,
	type Icon as IconType,
} from "@lucide/astro"

type iconType = {
	id: string
	name: string
	icon: typeof IconType
}

export const iconItems: iconType[] = [
	{ id: "serv-wifi", name: "Wi-Fi Gratuito", icon: Wifi },
	{ id: "serv-breakfast", name: "Desayuno incluido", icon: Coffee },
	{ id: "serv-parking", name: "Estacionamiento", icon: CircleParking },
	{ id: "serv-car", name: "Auto", icon: Car },
	{ id: "serv-spa", name: "Spa", icon: HeartPulse },
	{ id: "serv-gym", name: "Gimnasio / Sala fitness", icon: Dumbbell },
	{ id: "serv-restaurant", name: "Restaurante", icon: Utensils },
	{ id: "serv-room-service", name: "Room service", icon: Tent },
	{ id: "serv-bar", name: "Bar / Lounge", icon: Beer },
	{ id: "serv-laundry", name: "Lavandería / Tintorería", icon: Shirt },
	{ id: "serv-shuttle", name: "Transporte / Shuttle", icon: Bus },
	{ id: "serv-pool", name: "Piscina", icon: Waves },
	{ id: "serv-pet-friendly", name: "Pet-friendly (acepta mascotas)", icon: PawPrint },
]
