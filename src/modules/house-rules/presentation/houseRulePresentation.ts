import type { HouseRulePayload, HouseRuleType } from "../domain/houseRule"

export type HouseRuleGroup = {
	key: string
	label: string
	description: string
	types: HouseRuleType[]
}

export type HouseRuleCopy = {
	label: string
	intent: string
	guestFacing: string
}

export const houseRuleTypes: HouseRuleType[] = [
	"Pets",
	"Children",
	"Smoking",
	"Parties",
	"QuietHours",
	"Parking",
	"CheckIn",
	"Checkout",
	"Safety",
	"ExtraBeds",
	"Access",
	"Other",
]

export const essentialHouseRuleTypes: HouseRuleType[] = [
	"Pets",
	"Smoking",
	"Parties",
	"QuietHours",
	"CheckIn",
	"Checkout",
]

export const houseRuleGroups: HouseRuleGroup[] = [
	{
		key: "before-booking",
		label: "Antes de reservar",
		description: "Lo que el huésped revisa antes de confirmar.",
		types: ["Pets", "Children", "Smoking", "Parties", "QuietHours"],
	},
	{
		key: "arrival",
		label: "Llegada y acceso",
		description: "Lo que ayuda a entrar sin fricción.",
		types: ["CheckIn", "Access", "Parking"],
	},
	{
		key: "during-stay",
		label: "Durante la estadía",
		description: "Uso del alojamiento, seguridad y espacios compartidos.",
		types: ["Safety", "ExtraBeds", "Other"],
	},
	{
		key: "departure",
		label: "Salida",
		description: "Horario de salida y tareas simples.",
		types: ["Checkout"],
	},
]

export const houseRuleCopy: Record<HouseRuleType, HouseRuleCopy> = {
	Children: {
		label: "Niños",
		intent: "Indica si aceptas niños y cualquier cuidado importante.",
		guestFacing: "¿Pueden alojarse niños?",
	},
	Pets: {
		label: "Mascotas",
		intent: "Aclara si aceptas mascotas y condiciones básicas.",
		guestFacing: "¿Pueden traer mascotas?",
	},
	Smoking: {
		label: "Fumar",
		intent: "Define si se permite fumar y dónde.",
		guestFacing: "¿Se permite fumar?",
	},
	Parties: {
		label: "Fiestas y eventos",
		intent: "Aclara reuniones, eventos y uso responsable.",
		guestFacing: "¿Se permiten fiestas o eventos?",
	},
	QuietHours: {
		label: "Horario de silencio",
		intent: "Evita ruido en horarios sensibles.",
		guestFacing: "¿Cuándo deben mantener silencio?",
	},
	Parking: {
		label: "Estacionamiento",
		intent: "Explica si hay estacionamiento y cómo usarlo.",
		guestFacing: "¿Dónde pueden estacionar?",
	},
	CheckIn: {
		label: "Llegada",
		intent: "Indica cómo entran y qué necesitan al llegar.",
		guestFacing: "¿Cómo será la llegada?",
	},
	Checkout: {
		label: "Salida",
		intent: "Define hora de salida y tareas simples.",
		guestFacing: "¿Qué deben hacer antes de salir?",
	},
	Safety: {
		label: "Seguridad y espacios",
		intent: "Aclara zonas compartidas, restringidas o de cuidado.",
		guestFacing: "¿Cómo deben usar el alojamiento de forma segura?",
	},
	ExtraBeds: {
		label: "Camas adicionales",
		intent: "Aclara cunas, camas extra o arreglos para dormir.",
		guestFacing: "¿Hay camas extra o cunas?",
	},
	Access: {
		label: "Acceso",
		intent: "Explica llaves, códigos o dispositivos de entrada.",
		guestFacing: "¿Cómo se accede al alojamiento?",
	},
	Other: {
		label: "Otra regla",
		intent: "Agrega una expectativa de estadía que no encaja arriba.",
		guestFacing: "¿Qué más debe saber el huésped?",
	},
}

export const houseRuleLabels = Object.fromEntries(
	Object.entries(houseRuleCopy).map(([type, copy]) => [type, copy.label])
) as Record<HouseRuleType, string>

export const houseRuleEditorTypes: HouseRuleType[] = [
	"Pets",
	"Smoking",
	"Parties",
	"QuietHours",
	"CheckIn",
	"Checkout",
	"Children",
	"Parking",
	"Access",
	"Safety",
	"ExtraBeds",
	"Other",
]

export const houseRuleQuickSetups: Array<{
	key: string
	title: string
	description: string
	rules: Array<{ type: HouseRuleType; payload: HouseRulePayload }>
}> = [
	{
		key: "hotel-baseline",
		title: "Base de alojamiento",
		description: "Sin fumar, sin fiestas, silencio nocturno, llegada clara y salida simple.",
		rules: [
			{ type: "Children", payload: { kind: "Children", allowed: true } },
			{ type: "Smoking", payload: { kind: "Smoking", allowed: false, area: "not_allowed" } },
			{ type: "Parties", payload: { kind: "Parties", allowed: false } },
			{ type: "QuietHours", payload: { kind: "QuietHours", start: "22:00", end: "08:00" } },
			{ type: "CheckIn", payload: { kind: "CheckIn", method: "front_desk", idRequired: true } },
			{
				type: "Checkout",
				payload: { kind: "Checkout", time: "11:00", tasks: ["devolver llaves o acceso"] },
			},
		],
	},
	{
		key: "self-service-stay",
		title: "Llegada autónoma",
		description: "Acceso autónomo, silencio nocturno y salida liviana.",
		rules: [
			{ type: "Pets", payload: { kind: "Pets", allowed: false } },
			{ type: "Smoking", payload: { kind: "Smoking", allowed: false, area: "not_allowed" } },
			{ type: "Parties", payload: { kind: "Parties", allowed: false } },
			{ type: "QuietHours", payload: { kind: "QuietHours", start: "22:00", end: "08:00" } },
			{
				type: "CheckIn",
				payload: {
					kind: "CheckIn",
					method: "self",
					instructions: "Las instrucciones de llegada se comparten antes del check-in.",
				},
			},
			{
				type: "Checkout",
				payload: {
					kind: "Checkout",
					time: "11:00",
					tasks: ["cerrar puertas y ventanas", "apagar luces y electrodomésticos"],
				},
			},
		],
	},
]
