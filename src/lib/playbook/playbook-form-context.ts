/** Query keys echoed into playbook POST forms without loading pricing/inventory on editorial pages. */
export const PLAYBOOK_FORM_PASSTHROUGH_QUERY_KEYS = [
	"variantId",
	"ratePlanId",
	"returnTo",
	"tourFlowVersion",
] as const
