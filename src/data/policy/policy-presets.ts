// UI presets only (no backend coupling).
// Kept minimal and aligned with CAPA 6 supported categories.
export const POLICY_PRESETS = {
	Cancellation: [
		{
			key: "flex_24h",
			name: "Flexible (24h)",
			description: "Free cancellation until 24 hours before check-in.",
		},
		{
			key: "non_refundable",
			name: "Non-refundable",
			description: "This rate is non-refundable.",
		},
	],
	Payment: [
		{
			key: "pay_at_property",
			name: "Pay at property",
			description: "Guests pay at the property.",
		},
		{
			key: "prepayment",
			name: "Prepayment",
			description: "Guests must prepay before arrival.",
		},
	],
	CheckIn: [
		{
			key: "standard",
			name: "Standard check-in",
			description: "Check-in from 15:00, check-out until 11:00.",
		},
	],
	NoShow: [
		{
			key: "first_night",
			name: "No-show: first night",
			description: "If the guest does not arrive, the first night will be charged.",
		},
	],
} as const
