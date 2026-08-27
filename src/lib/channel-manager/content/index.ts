export {
	CHANNEL_CONTENT_LAYERS,
	CHANNEL_CONTENT_OWNERSHIP,
	CHECK_IN_POLICY_LAYER_BY_SCOPE,
	PROPERTY_ONLY_HOUSE_RULE_TYPES,
	RATE_COMMERCIAL_POLICY_CATEGORIES,
	UNIT_LAYER_HOUSE_RULE_TYPES,
	assertChannelContentPlacement,
	isForbiddenHouseRuleCommercialKey,
	isForbiddenRateHouseRuleType,
	isForbiddenUnitHouseRuleType,
	listOwnershipByLayer,
	ownershipCoverageGaps,
	resolveChannelContentLayer,
	type ChannelContentLayer,
	type ChannelContentOwnershipRule,
	type ChannelContentSourceKind,
} from "./channelContentOwnership"

export {
	layersPresentInDraft,
	projectChannelContent,
	type ChannelContentDraft,
	type ChannelContentProjectionInput,
	type ChannelHouseRuleInput,
	type ChannelPropertyContentDraft,
	type ChannelRateArrivalExceptionInput,
	type ChannelRateCommercialDraft,
	type ChannelRatePolicyInput,
	type ChannelRateScheduleExceptionDraft,
	type ChannelUnitContentDraft,
	type ChannelVariantHouseRuleInput,
} from "./channelContentProjection"

export {
	assertValidChannelContentDraft,
	validateChannelContentDraft,
	type ChannelContentValidationIssue,
} from "./channelContentValidators"

export {
	CHANNEX_CONTENT_FIELD_MAP,
	channexFieldsForLayer,
	type ChannexContentField,
} from "./channex/channexContentFieldMap"

export {
	EXPEDIA_CONTENT_FIELD_MAP,
	EXPEDIA_LAYER_SEPARATION,
	expediaSurfacesForLayer,
	type ExpediaContentField,
} from "./expedia/expediaContentFieldMap"
