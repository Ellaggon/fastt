// Canonical policy scopes (CAPA 6).
// "hotel" scope is intentionally not supported. Hotels are modeled as Product subtype (Hotel.productId).
export type PolicyScope = "global" | "product" | "variant" | "rate_plan"
