// UI templates only. They describe provider-facing contract presets and do not
// change policy resolution or booking snapshots by themselves.
export const POLICY_PRESETS = {
	Cancellation: [
		{
			key: "flex_24h",
			name: "Flexible 24h",
			description: "Free cancellation until 24 hours before check-in.",
			guestFacing: "Guests can cancel up to 1 day before arrival without a penalty.",
			operationalMeaning: "Use for flexible public rates and new providers building trust.",
			cancellationTiers: [
				{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
				{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
			],
		},
		{
			key: "moderate_7d",
			name: "Moderate 7d",
			description: "Free cancellation until 7 days before check-in, then first-stage penalty.",
			guestFacing: "Guests can cancel up to 7 days before arrival without a penalty.",
			operationalMeaning: "Good default for seasonal properties that need some demand protection.",
			cancellationTiers: [
				{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 0 },
				{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 50 },
				{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
			],
		},
		{
			key: "non_refundable",
			name: "Non-refundable",
			description: "Cancellation always carries a full penalty.",
			guestFacing: "If guests cancel, the booking is non-refundable.",
			operationalMeaning:
				"Use only when the rate plan packaging clearly communicates the non-refundable contract.",
			cancellationTiers: [{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 }],
		},
	],
	Payment: [
		{
			key: "pay_at_property",
			name: "Pay at property",
			description: "Guests pay at the property.",
			guestFacing: "Payment is collected by the property according to its local process.",
			operationalMeaning: "No platform prepayment is required before arrival.",
			rules: { paymentType: "pay_at_property" },
		},
		{
			key: "prepayment_full",
			name: "Full prepayment",
			description: "Guests must prepay 100% before arrival.",
			guestFacing: "The full booking amount is due before arrival.",
			operationalMeaning: "Use with stricter cancellation policies or high-demand periods.",
			rules: {
				paymentType: "prepayment",
				prepaymentPercentage: 100,
				prepaymentDaysBeforeArrival: 0,
			},
		},
		{
			key: "deposit_50",
			name: "50% deposit",
			description: "Guests prepay a 50% deposit before arrival.",
			guestFacing: "A 50% prepayment is required to secure the reservation.",
			operationalMeaning:
				"Fase 1 stores this as payment terms; dedicated deposit clauses come later.",
			rules: {
				paymentType: "prepayment",
				prepaymentPercentage: 50,
				prepaymentDaysBeforeArrival: 0,
			},
		},
	],
	CheckIn: [
		{
			key: "standard",
			name: "Standard check-in",
			description: "Check-in from 15:00, check-out until 11:00.",
			guestFacing: "Check-in starts at 15:00 and check-out is until 11:00.",
			operationalMeaning: "Default operational window for most lodging providers.",
			rules: { checkInFrom: "15:00", checkInUntil: "22:00", checkOutUntil: "11:00" },
		},
		{
			key: "late_arrival",
			name: "Late-arrival friendly",
			description: "Check-in from 15:00 until 00:00, check-out until 11:00.",
			guestFacing: "Guests may arrive later, until midnight.",
			operationalMeaning: "Use only when reception or self check-in can support late arrivals.",
			rules: { checkInFrom: "15:00", checkInUntil: "00:00", checkOutUntil: "11:00" },
		},
	],
	NoShow: [
		{
			key: "first_night",
			name: "First-night no-show",
			description: "If the guest does not arrive, the first night is charged.",
			guestFacing: "If guests do not arrive, the first night is charged.",
			operationalMeaning: "Balanced default for flexible and moderate rates.",
			rules: { penaltyType: "first_night" },
		},
		{
			key: "full_stay",
			name: "Full-stay no-show",
			description: "If the guest does not arrive, the full stay is charged.",
			guestFacing: "If guests do not arrive, the full booking amount is charged.",
			operationalMeaning: "Use for stricter or non-refundable rate plans.",
			rules: { penaltyType: "full" },
		},
		{
			key: "percentage_100",
			name: "100% no-show",
			description: "If the guest does not arrive, 100% of the booking is charged.",
			guestFacing: "If guests do not arrive, 100% of the booking amount is charged.",
			operationalMeaning: "Equivalent to a full penalty while keeping percentage semantics.",
			rules: { penaltyType: "percentage", penaltyAmount: 100 },
		},
	],
} as const
