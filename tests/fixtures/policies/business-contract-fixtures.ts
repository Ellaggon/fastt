export const POLICY_BUSINESS_CONTRACT_FIXTURES = {
	hotel: {
		productType: "Hotel",
		categories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		cancellation: { anchor: "arrival", units: ["days"], bases: ["total_booking", "room_rate"] },
		noShowBases: ["first_night", "total_booking", "percentage"],
		paymentTypes: ["pay_at_property", "prepayment"],
		platformCollectsFunds: true,
	},
	tour: {
		productType: "Tour",
		categories: ["Cancellation", "Payment", "NoShow"],
		cancellation: { anchor: "scheduled_departure", units: ["hours"], bases: ["total_booking"] },
		noShowBases: ["total_booking", "percentage"],
		paymentTypes: ["pay_at_property"],
		platformCollectsFunds: false,
	},
	unknown: {
		productType: "Limousine",
		categories: [],
		cancellation: { anchor: "unsupported", units: [], bases: [] },
		noShowBases: [],
		paymentTypes: [],
		platformCollectsFunds: false,
	},
} as const
