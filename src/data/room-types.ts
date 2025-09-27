export const ROOM_TYPES = [
	{
		id: "407b1e7b-c361-4a57-810a-6e1b6f634812",
		name: "Habitación Individual",
		maxCapacity: 1,
		description: "Una cama, ideal para viajeros solitarios.",
	},
	{
		id: "622d64d1-c11c-4b53-839e-d309191d8422",
		name: "Habitación Doble",
		maxCapacity: 2,
		description: "Una o dos camas, para parejas o amigos.",
	},
	{
		id: "1b4f4c28-9418-472e-8d96-410a8276f578",
		name: "Habitación Triple",
		maxCapacity: 3,
		description: "Tres camas o una doble y una individual.",
	},
	{
		id: "f0c9b1f5-e2a2-4a0b-8d19-2169b2d69f3d",
		name: "Habitación Cuádruple",
		maxCapacity: 4,
		description: "Ideal para familias o grupos pequeños.",
	},
	{
		id: "7e2c94d3-b1d6-4e56-9a57-6f8d3c1a3b9a",
		name: "Suite",
		maxCapacity: 2,
		description: "Habitación de lujo con sala de estar separada.",
	},
] as const

export type RoomType = (typeof ROOM_TYPES)[number]
