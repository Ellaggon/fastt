// Canonical policy categories (CAPA 6).
//
// NOTE: This list is intentionally small and aligned with the current UI taxonomy.
// We can extend this later, but write paths must validate categories strictly to
// prevent inconsistent data.
export const POLICY_CATEGORIES = [
	"Cancellation",
	"NoShow",
	"Smoking",
	"Pets",
	"CheckIn",
	"CheckOut",
	"Children",
	"Access",
	"ExtraBeds",
	"Payment",
	"Other",
] as const

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number]
