-- Fastt Supabase initial schema.

-- Generated from src/shared/infrastructure/db/schema/tables.ts.

-- Do not reuse SQLite/Turso migration history for this baseline.



BEGIN;



CREATE TABLE "Provider" (
	"id" text PRIMARY KEY,
	"legalName" text,
	"displayName" text,
	"status" text,
	"createdAt" timestamp with time zone
);

CREATE TABLE "ProviderProfile" (
	"providerId" text PRIMARY KEY,
	"timezone" text NOT NULL,
	"defaultCurrency" text NOT NULL DEFAULT 'USD',
	"supportEmail" text,
	"supportPhone" text,
	"governanceUpdatedAt" timestamp with time zone,
	"professionalToolsEnabled" boolean NOT NULL DEFAULT false,
	"professionalToolsUpdatedAt" timestamp with time zone,
	"professionalToolsUpdatedBy" text
);

CREATE TABLE "ProviderDocument" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"fileUrl" text,
	"metadataJson" jsonb,
	"reviewNotes" text,
	"reviewedAt" timestamp with time zone,
	"reviewedBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderTaxConfiguration" (
	"providerId" text PRIMARY KEY,
	"status" text NOT NULL DEFAULT 'not_configured',
	"taxResidenceCountry" text,
	"businessRegistrationNumber" text,
	"taxRegime" text,
	"invoicingMode" text NOT NULL DEFAULT 'platform_receipt',
	"metadataJson" jsonb,
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedBy" text
);

CREATE TABLE "ProviderPaymentAccount" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"status" text NOT NULL DEFAULT 'not_configured',
	"provider" text NOT NULL,
	"currency" text NOT NULL,
	"accountHolderName" text,
	"bankName" text,
	"country" text,
	"routingOrSwift" text,
	"accountNumberLast4" text,
	"accountReference" text,
	"payoutSchedule" text NOT NULL DEFAULT 'manual',
	"metadataJson" jsonb,
	"verifiedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationConnection" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectorKey" text NOT NULL,
	"status" text NOT NULL DEFAULT 'not_configured',
	"mode" text NOT NULL DEFAULT 'sandbox',
	"scopesJson" jsonb,
	"credentialsRef" text,
	"lastSyncAt" timestamp with time zone,
	"lastSyncStatus" text,
	"errorMessage" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationSyncLog" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectorKey" text NOT NULL,
	"connectionId" text,
	"eventType" text NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL DEFAULT 'sandbox',
	"message" text,
	"metadataJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderAuditLog" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"actorUserId" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"beforeJson" jsonb,
	"afterJson" jsonb,
	"riskLevel" text NOT NULL DEFAULT 'low',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderComplianceAssignment" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"domain" text NOT NULL,
	"entityId" text NOT NULL,
	"assigneeEmail" text,
	"slaHours" integer NOT NULL DEFAULT 48,
	"slaDueAt" timestamp with time zone NOT NULL,
	"status" text NOT NULL DEFAULT 'open',
	"notes" text,
	"createdBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderConfigurationState" (
	"providerId" text PRIMARY KEY,
	"canPublish" boolean NOT NULL DEFAULT false,
	"canAcceptBookings" boolean NOT NULL DEFAULT false,
	"canCollectPayments" boolean NOT NULL DEFAULT false,
	"canUseIntegrations" boolean NOT NULL DEFAULT false,
	"readinessPercent" integer NOT NULL DEFAULT 0,
	"blockersJson" jsonb,
	"risksJson" jsonb,
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderVerification" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"reason" text,
	"reviewedAt" timestamp with time zone,
	"reviewedBy" text,
	"metadataJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderUser" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL DEFAULT 'owner',
	"permissionsJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderInvitation" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"invitedBy" text NOT NULL,
	"acceptedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "User" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"username" text,
	"passwordHash" text,
	"firstName" text,
	"lastName" text,
	"registrationDate" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderFinancialProfile" (
	"providerId" text PRIMARY KEY,
	"payoutMethodReference" text,
	"payoutSchedule" text NOT NULL,
	"currency" text NOT NULL,
	"taxProfileStatus" text NOT NULL,
	"status" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderPayableSnapshot" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"grossAmount" numeric(14, 2) NOT NULL,
	"commissionAmount" numeric(14, 2) NOT NULL,
	"taxAmount" numeric(14, 2) NOT NULL,
	"netPayable" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"basis" text NOT NULL,
	"snapshotAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderStatement" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"statementReference" text,
	"periodStart" timestamp with time zone,
	"periodEnd" timestamp with time zone,
	"status" text NOT NULL,
	"totalGrossAmount" numeric(14, 2) NOT NULL,
	"totalCommissionAmount" numeric(14, 2) NOT NULL,
	"totalTaxAmount" numeric(14, 2) NOT NULL,
	"totalNetPayable" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"basis" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "Destination" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"country" text NOT NULL,
	"department" text,
	"latitude" real,
	"longitude" real,
	"slug" text NOT NULL
);

CREATE TABLE "RoomType" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"maxOccupancy" integer,
	"description" text
);

CREATE TABLE "AmenityRoom" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"category" text
);

CREATE TABLE "Service" (
	"id" text PRIMARY KEY
);

CREATE TABLE "Image" (
	"id" text PRIMARY KEY,
	"entityType" text,
	"entityId" text,
	"objectKey" text NOT NULL,
	"url" text NOT NULL,
	"order" integer NOT NULL DEFAULT 0,
	"isPrimary" boolean NOT NULL DEFAULT false
);

CREATE TABLE "ImageUpload" (
	"id" text PRIMARY KEY,
	"imageId" text NOT NULL,
	"objectKey" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"completedAt" timestamp with time zone
);

CREATE TABLE "Translation" (
	"id" text PRIMARY KEY,
	"tableRef" text NOT NULL,
	"columnRef" text NOT NULL,
	"recordId" text NOT NULL,
	"languageCode" text NOT NULL,
	"translatedText" text NOT NULL
);

CREATE TABLE "Product" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"productType" text NOT NULL,
	"creationDate" timestamp with time zone NOT NULL DEFAULT now(),
	"lastUpdated" timestamp with time zone NOT NULL DEFAULT now(),
	"providerId" text,
	"destinationId" text NOT NULL
);

CREATE TABLE "HouseRule" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"type" text NOT NULL,
	"payloadJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductStatus" (
	"productId" text PRIMARY KEY,
	"state" text NOT NULL DEFAULT 'draft',
	"validationErrorsJson" jsonb
);

CREATE TABLE "ProductPreparationSnapshot" (
	"productId" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"statusLabel" text NOT NULL DEFAULT 'En preparación',
	"statusVariant" text NOT NULL DEFAULT 'warning',
	"isPublished" boolean NOT NULL DEFAULT false,
	"readinessPercent" integer NOT NULL DEFAULT 0,
	"blockerCount" integer NOT NULL DEFAULT 0,
	"blockerPreviewJson" jsonb,
	"readyToPublish" boolean NOT NULL DEFAULT false,
	"continuePreparationHref" text NOT NULL,
	"previewHref" text NOT NULL,
	"nextStepLabel" text,
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductContent" (
	"productId" text PRIMARY KEY,
	"description" text,
	"highlightsJson" jsonb,
	"seoJson" jsonb
);

CREATE TABLE "ProductLocation" (
	"productId" text PRIMARY KEY,
	"address" text,
	"lat" real,
	"lng" real
);

CREATE TABLE "Hotel" (
	"productId" text PRIMARY KEY,
	"stars" integer,
	"phone" text,
	"email" text,
	"website" text
);

CREATE TABLE "Tour" (
	"productId" text PRIMARY KEY,
	"duration" text,
	"difficultyLevel" text,
	"meetingPointJson" jsonb,
	"itineraryJson" jsonb,
	"safetyJson" jsonb,
	"guideJson" jsonb
);

CREATE TABLE "Package" (
	"productId" text PRIMARY KEY,
	"days" integer,
	"nights" integer,
	"itineraryJson" jsonb,
	"includesJson" jsonb,
	"excludesJson" jsonb
);

CREATE TABLE "Limousine" (
	"productId" text PRIMARY KEY,
	"vehicleProfileJson" jsonb,
	"pickupJson" jsonb,
	"dropoffJson" jsonb,
	"passengerCapacity" integer,
	"luggageCapacity" integer
);

CREATE TABLE "Variant" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"status" text,
	"createdAt" timestamp with time zone,
	"confirmationType" text NOT NULL DEFAULT 'instant',
	"externalCode" text,
	"isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "VariantCapacity" (
	"variantId" text PRIMARY KEY,
	"minOccupancy" integer NOT NULL,
	"maxOccupancy" integer NOT NULL,
	"maxAdults" integer,
	"maxChildren" integer
);

CREATE TABLE "VariantRoomProfile" (
	"variantId" text PRIMARY KEY,
	"roomTypeId" text,
	"sizeM2" integer,
	"viewType" text,
	"bathroomCount" integer,
	"bathroomType" text,
	"hasBalcony" boolean,
	"guestFacingNotes" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "VariantRoomBed" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"bedType" text NOT NULL,
	"count" integer NOT NULL DEFAULT 1,
	"roomLabel" text,
	"sortOrder" integer NOT NULL DEFAULT 0
);

CREATE TABLE "VariantRoomAmenity" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"amenityId" text NOT NULL,
	"isAvailable" boolean NOT NULL DEFAULT true,
	"notes" text
);

CREATE TABLE "VariantReadiness" (
	"variantId" text PRIMARY KEY,
	"state" text NOT NULL DEFAULT 'draft',
	"validationErrorsJson" jsonb,
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductService" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"serviceId" text NOT NULL,
	"price" numeric(14, 2),
	"currency" text,
	"priceUnit" text,
	"appliesTo" text NOT NULL DEFAULT 'both',
	"notes" text
);

CREATE TABLE "ProductServiceAttribute" (
	"id" text PRIMARY KEY,
	"productServiceId" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL
);

CREATE TABLE "PolicyGroup" (
	"id" text PRIMARY KEY,
	"category" text NOT NULL,
	"ownerProviderId" text NOT NULL
);

CREATE TABLE "Policy" (
	"id" text PRIMARY KEY,
	"groupId" text NOT NULL,
	"description" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"policyPresetKey" text,
	"stayLengthType" text,
	"gracePeriod" integer,
	"refundBasis" text,
	"payoutBasis" text,
	"localTimezone" text,
	"effectiveFrom" date,
	"effectiveTo" date
);

CREATE TABLE "PolicyAssignment" (
	"id" text PRIMARY KEY,
	"policyGroupId" text NOT NULL,
	"category" text NOT NULL,
	"scope" text NOT NULL,
	"scopeId" text NOT NULL,
	"channel" text,
	"effectiveFrom" date,
	"effectiveTo" date,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CancellationTier" (
	"id" text PRIMARY KEY,
	"policyId" text NOT NULL,
	"daysBeforeArrival" integer NOT NULL,
	"penaltyType" text NOT NULL DEFAULT 'percentage',
	"penaltyAmount" numeric(14, 2)
);

CREATE TABLE "PolicyRule" (
	"id" text PRIMARY KEY,
	"policyId" text NOT NULL,
	"ruleKey" text NOT NULL,
	"ruleValue" jsonb
);

CREATE TABLE "PolicyExceptionRule" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"scope" text NOT NULL DEFAULT 'global',
	"scopeId" text,
	"category" text,
	"priority" integer NOT NULL DEFAULT 100,
	"isActive" boolean NOT NULL DEFAULT true,
	"effectiveFrom" date,
	"effectiveTo" date,
	"reason" text,
	"actionJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"createdBy" text
);

CREATE TABLE "PolicyAuditLog" (
	"id" text PRIMARY KEY,
	"eventType" text NOT NULL,
	"actorUserId" text,
	"policyId" text,
	"policyGroupId" text,
	"assignmentId" text,
	"scope" text,
	"scopeId" text,
	"channel" text,
	"beforeJson" jsonb,
	"afterJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "VariantInventoryConfig" (
	"variantId" text PRIMARY KEY,
	"defaultTotalUnits" integer NOT NULL,
	"horizonDays" integer NOT NULL DEFAULT 365,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "DailyInventory" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"date" date NOT NULL,
	"totalInventory" integer NOT NULL,
	"reservedCount" integer NOT NULL DEFAULT 0,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "EffectiveAvailability" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"date" date NOT NULL,
	"totalUnits" integer NOT NULL DEFAULT 0,
	"heldUnits" integer NOT NULL DEFAULT 0,
	"bookedUnits" integer NOT NULL DEFAULT 0,
	"availableUnits" integer NOT NULL DEFAULT 0,
	"computedAt" timestamp with time zone NOT NULL
);

CREATE TABLE "InventoryLock" (
	"id" text PRIMARY KEY,
	"holdId" text,
	"variantId" text NOT NULL,
	"date" date NOT NULL,
	"quantity" integer NOT NULL DEFAULT 1,
	"expiresAt" timestamp with time zone NOT NULL,
	"bookingId" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "Hold" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"ratePlanId" text NOT NULL,
	"checkIn" date NOT NULL,
	"checkOut" date NOT NULL,
	"channel" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"policySnapshotJson" jsonb NOT NULL,
	"guestExpectationsSnapshotJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "SearchUnitView" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"productId" text NOT NULL,
	"ratePlanId" text NOT NULL,
	"date" date NOT NULL,
	"occupancyKey" text NOT NULL,
	"totalGuests" integer NOT NULL,
	"hasAvailability" boolean NOT NULL DEFAULT false,
	"hasPrice" boolean NOT NULL DEFAULT false,
	"isAvailable" boolean NOT NULL DEFAULT false,
	"availableUnits" integer NOT NULL DEFAULT 0,
	"pricePerNight" numeric(14, 2),
	"currency" text NOT NULL DEFAULT 'USD',
	"primaryBlocker" text,
	"minStay" integer,
	"maxStay" integer,
	"minLeadTime" integer,
	"maxLeadTime" integer,
	"cta" boolean NOT NULL DEFAULT false,
	"ctd" boolean NOT NULL DEFAULT false,
	"computedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"sourceVersion" text NOT NULL
);

CREATE TABLE "RatePlan" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"isDefault" boolean NOT NULL DEFAULT false,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "RatePlanOccupancyPolicy" (
	"id" text PRIMARY KEY,
	"ratePlanId" text NOT NULL,
	"baseAmount" numeric(14, 2) NOT NULL,
	"baseCurrency" text NOT NULL DEFAULT 'USD',
	"baseAdults" integer NOT NULL,
	"baseChildren" integer NOT NULL,
	"extraAdultMode" text NOT NULL,
	"extraAdultValue" numeric(14, 2) NOT NULL,
	"childMode" text NOT NULL,
	"childValue" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"effectiveFrom" timestamp with time zone NOT NULL,
	"effectiveTo" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CommercialRuleSet" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"status" text NOT NULL DEFAULT 'active',
	"priority" integer NOT NULL DEFAULT 100,
	"dateFrom" date,
	"dateTo" date,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"archivedAt" timestamp with time zone
);

CREATE TABLE "CommercialRule" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"ruleSetId" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"value" numeric(14, 2),
	"configJson" jsonb,
	"priority" integer NOT NULL DEFAULT 100,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CommercialRuleApplication" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"ruleSetId" text NOT NULL,
	"ruleId" text NOT NULL,
	"scope" text NOT NULL,
	"scopeId" text NOT NULL,
	"startDate" date,
	"endDate" date,
	"validDays" jsonb,
	"channel" text,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "EffectiveRestriction" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"ratePlanId" text,
	"date" date NOT NULL,
	"minStay" integer,
	"maxStay" integer,
	"minLeadTime" integer,
	"maxLeadTime" integer,
	"cta" boolean NOT NULL DEFAULT false,
	"ctd" boolean NOT NULL DEFAULT false,
	"stopSell" boolean NOT NULL DEFAULT false,
	"priority" integer NOT NULL DEFAULT 0,
	"computedAt" timestamp with time zone NOT NULL
);

CREATE TABLE "EffectivePricingV2" (
	"id" text PRIMARY KEY,
	"variantId" text NOT NULL,
	"ratePlanId" text NOT NULL,
	"date" date NOT NULL,
	"occupancyKey" text NOT NULL,
	"baseComponent" numeric(14, 2) NOT NULL,
	"occupancyAdjustment" numeric(14, 2) NOT NULL,
	"ruleAdjustment" numeric(14, 2) NOT NULL,
	"finalBasePrice" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL DEFAULT 'USD',
	"computedAt" timestamp with time zone NOT NULL,
	"sourceVersion" text NOT NULL DEFAULT 'v2'
);

CREATE TABLE "TaxFeeDefinition" (
	"id" text PRIMARY KEY,
	"providerId" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"calculationType" text NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"currency" text,
	"inclusionType" text NOT NULL,
	"appliesPer" text NOT NULL,
	"priority" integer NOT NULL DEFAULT 0,
	"jurisdictionJson" jsonb,
	"effectiveFrom" timestamp with time zone,
	"effectiveTo" timestamp with time zone,
	"status" text NOT NULL DEFAULT 'active',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TaxFeeAssignment" (
	"id" text PRIMARY KEY,
	"taxFeeDefinitionId" text NOT NULL,
	"scope" text NOT NULL,
	"scopeId" text,
	"channel" text,
	"status" text NOT NULL DEFAULT 'active',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "BookingTaxFee" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"name" text,
	"breakdownJson" jsonb NOT NULL,
	"totalAmount" numeric(14, 2) NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "Booking" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"userId" text,
	"ratePlanId" text NOT NULL,
	"bookingDate" timestamp with time zone NOT NULL DEFAULT now(),
	"checkInDate" date NOT NULL,
	"checkOutDate" date NOT NULL,
	"numAdults" integer NOT NULL DEFAULT 1,
	"numChildren" integer NOT NULL DEFAULT 0,
	"totalAmount" numeric(14, 2) NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"operationalStatus" text NOT NULL DEFAULT 'pending_arrival',
	"checkedInAt" timestamp with time zone,
	"checkedInBy" text,
	"checkedOutAt" timestamp with time zone,
	"checkedOutBy" text,
	"noShowAt" timestamp with time zone,
	"noShowBy" text,
	"notes" text,
	"currency" text NOT NULL,
	"source" text NOT NULL DEFAULT 'web',
	"confirmedAt" timestamp with time zone,
	"guestEmailSnapshot" text,
	"guestNameSnapshot" text,
	"guestContactSnapshotJson" jsonb,
	"lifecycleAuditJson" jsonb,
	"refundHandoffSnapshotJson" jsonb,
	"contractSnapshotVersion" text
);

CREATE TABLE "BookingRoomDetail" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"variantId" text NOT NULL,
	"ratePlanId" text NOT NULL,
	"checkIn" date NOT NULL,
	"checkOut" date NOT NULL,
	"adults" integer NOT NULL,
	"children" integer NOT NULL,
	"subtotalAmount" numeric(14, 2) NOT NULL,
	"taxAmount" numeric(14, 2) NOT NULL,
	"totalAmount" numeric(14, 2) NOT NULL,
	"pricingBreakdownJson" jsonb,
	"providerIdSnapshot" text,
	"productIdSnapshot" text,
	"productNameSnapshot" text,
	"variantNameSnapshot" text,
	"ratePlanNameSnapshot" text,
	"occupancySnapshotJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "BookingPolicySnapshot" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"category" text NOT NULL,
	"policyId" text,
	"policySnapshotJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone
);

CREATE TABLE "FinancialExceptionRecord" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"basis" text NOT NULL,
	"reason" text NOT NULL,
	"nextOwner" text NOT NULL,
	"source" text NOT NULL,
	"openedAt" timestamp with time zone NOT NULL,
	"acknowledgedAt" timestamp with time zone,
	"resolvedAt" timestamp with time zone,
	"resolvedBy" text,
	"resolutionNote" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "FinancialReference" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"type" text NOT NULL,
	"referenceValue" text NOT NULL,
	"externalSystem" text,
	"amount" numeric(14, 2),
	"currency" text,
	"recordedAt" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"basis" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "RefundHandoffRecord" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"refundType" text NOT NULL,
	"expectedAmount" numeric(14, 2),
	"currency" text,
	"basis" text NOT NULL,
	"nextOwner" text NOT NULL,
	"openedAt" timestamp with time zone NOT NULL,
	"acknowledgedAt" timestamp with time zone,
	"closedAt" timestamp with time zone,
	"notes" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "RefundQuote" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"currency" text NOT NULL,
	"grossAmount" numeric(14, 2) NOT NULL,
	"refundAmount" numeric(14, 2) NOT NULL,
	"nonRefundableAmount" numeric(14, 2) NOT NULL,
	"taxFeeRefundAmount" numeric(14, 2) NOT NULL,
	"payoutImpactAmount" numeric(14, 2) NOT NULL,
	"paymentDueLocal" text,
	"cancellationDeadlineLocal" text,
	"refundPercent" numeric(7, 4),
	"policySnapshotJson" jsonb NOT NULL,
	"linesJson" jsonb NOT NULL,
	"calculationSnapshotJson" jsonb NOT NULL,
	"idempotencyKey" text NOT NULL,
	"quotedAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "RefundLedger" (
	"id" text PRIMARY KEY,
	"refundQuoteId" text NOT NULL,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"refundAmount" numeric(14, 2) NOT NULL,
	"payoutImpactAmount" numeric(14, 2) NOT NULL,
	"paymentTransactionId" text,
	"externalReference" text,
	"basis" text NOT NULL,
	"calculationSnapshotJson" jsonb NOT NULL,
	"appliedAt" timestamp with time zone NOT NULL,
	"appliedBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "FinancialReviewEvent" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"financialExceptionId" text,
	"financialReferenceId" text,
	"refundHandoffId" text,
	"reconciliationMatchId" text,
	"type" text NOT NULL,
	"actorId" text,
	"actorType" text NOT NULL,
	"payloadJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "PaymentTransaction" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"externalReference" text NOT NULL,
	"pspProvider" text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "FinancialSettlementRecord" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"settlementReference" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"settlementDate" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"matchedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ReconciliationMatch" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"contractAmount" numeric(14, 2) NOT NULL,
	"paymentAmount" numeric(14, 2),
	"settlementAmount" numeric(14, 2),
	"differenceAmount" numeric(14, 2) NOT NULL,
	"status" text NOT NULL,
	"mismatchReasons" jsonb,
	"basis" text NOT NULL,
	"reviewStatus" text,
	"reviewState" text,
	"comparisonFingerprint" text,
	"reviewFingerprint" text,
	"reviewedAt" timestamp with time zone,
	"reviewedBy" text,
	"reviewNote" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CommissionSnapshot" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"providerId" text NOT NULL,
	"commissionRate" numeric(7, 4) NOT NULL,
	"commissionAmount" numeric(14, 2) NOT NULL,
	"basis" text NOT NULL,
	"currency" text NOT NULL,
	"snapshotAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "PayoutRecord" (
	"id" text PRIMARY KEY,
	"bookingId" text,
	"providerId" text NOT NULL,
	"status" text NOT NULL,
	"payoutReference" text,
	"amount" numeric(14, 2),
	"currency" text,
	"basis" text NOT NULL,
	"recordedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);



ALTER TABLE "ProviderProfile"
	ADD CONSTRAINT "ProviderProfile_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderProfile"
	ADD CONSTRAINT "ProviderProfile_professionalToolsUpdatedBy_fk"
	FOREIGN KEY ("professionalToolsUpdatedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderDocument"
	ADD CONSTRAINT "ProviderDocument_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderDocument"
	ADD CONSTRAINT "ProviderDocument_reviewedBy_fk"
	FOREIGN KEY ("reviewedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderTaxConfiguration"
	ADD CONSTRAINT "ProviderTaxConfiguration_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderTaxConfiguration"
	ADD CONSTRAINT "ProviderTaxConfiguration_updatedBy_fk"
	FOREIGN KEY ("updatedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderPaymentAccount"
	ADD CONSTRAINT "ProviderPaymentAccount_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationConnection"
	ADD CONSTRAINT "ProviderIntegrationConnection_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationSyncLog"
	ADD CONSTRAINT "ProviderIntegrationSyncLog_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationSyncLog"
	ADD CONSTRAINT "ProviderIntegrationSyncLog_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
;

ALTER TABLE "ProviderAuditLog"
	ADD CONSTRAINT "ProviderAuditLog_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderAuditLog"
	ADD CONSTRAINT "ProviderAuditLog_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderComplianceAssignment"
	ADD CONSTRAINT "ProviderComplianceAssignment_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderComplianceAssignment"
	ADD CONSTRAINT "ProviderComplianceAssignment_createdBy_fk"
	FOREIGN KEY ("createdBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderConfigurationState"
	ADD CONSTRAINT "ProviderConfigurationState_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderVerification"
	ADD CONSTRAINT "ProviderVerification_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderVerification"
	ADD CONSTRAINT "ProviderVerification_reviewedBy_fk"
	FOREIGN KEY ("reviewedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderUser"
	ADD CONSTRAINT "ProviderUser_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderUser"
	ADD CONSTRAINT "ProviderUser_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderInvitation"
	ADD CONSTRAINT "ProviderInvitation_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderInvitation"
	ADD CONSTRAINT "ProviderInvitation_invitedBy_fk"
	FOREIGN KEY ("invitedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderFinancialProfile"
	ADD CONSTRAINT "ProviderFinancialProfile_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ImageUpload"
	ADD CONSTRAINT "ImageUpload_imageId_fk"
	FOREIGN KEY ("imageId")
	REFERENCES "Image" ("id")
;

ALTER TABLE "Product"
	ADD CONSTRAINT "Product_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "Product"
	ADD CONSTRAINT "Product_destinationId_fk"
	FOREIGN KEY ("destinationId")
	REFERENCES "Destination" ("id")
;

ALTER TABLE "HouseRule"
	ADD CONSTRAINT "HouseRule_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductStatus"
	ADD CONSTRAINT "ProductStatus_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductPreparationSnapshot"
	ADD CONSTRAINT "ProductPreparationSnapshot_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductPreparationSnapshot"
	ADD CONSTRAINT "ProductPreparationSnapshot_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProductContent"
	ADD CONSTRAINT "ProductContent_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductLocation"
	ADD CONSTRAINT "ProductLocation_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "Hotel"
	ADD CONSTRAINT "Hotel_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "Tour"
	ADD CONSTRAINT "Tour_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "Package"
	ADD CONSTRAINT "Package_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "Limousine"
	ADD CONSTRAINT "Limousine_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "Variant"
	ADD CONSTRAINT "Variant_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "VariantCapacity"
	ADD CONSTRAINT "VariantCapacity_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "VariantRoomProfile"
	ADD CONSTRAINT "VariantRoomProfile_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "VariantRoomProfile"
	ADD CONSTRAINT "VariantRoomProfile_roomTypeId_fk"
	FOREIGN KEY ("roomTypeId")
	REFERENCES "RoomType" ("id")
;

ALTER TABLE "VariantRoomBed"
	ADD CONSTRAINT "VariantRoomBed_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "VariantRoomAmenity"
	ADD CONSTRAINT "VariantRoomAmenity_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "VariantRoomAmenity"
	ADD CONSTRAINT "VariantRoomAmenity_amenityId_fk"
	FOREIGN KEY ("amenityId")
	REFERENCES "AmenityRoom" ("id")
;

ALTER TABLE "VariantReadiness"
	ADD CONSTRAINT "VariantReadiness_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "ProductService"
	ADD CONSTRAINT "ProductService_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductService"
	ADD CONSTRAINT "ProductService_serviceId_fk"
	FOREIGN KEY ("serviceId")
	REFERENCES "Service" ("id")
;

ALTER TABLE "ProductServiceAttribute"
	ADD CONSTRAINT "ProductServiceAttribute_productServiceId_fk"
	FOREIGN KEY ("productServiceId")
	REFERENCES "ProductService" ("id")
;

ALTER TABLE "PolicyGroup"
	ADD CONSTRAINT "PolicyGroup_ownerProviderId_fk"
	FOREIGN KEY ("ownerProviderId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "Policy"
	ADD CONSTRAINT "Policy_groupId_fk"
	FOREIGN KEY ("groupId")
	REFERENCES "PolicyGroup" ("id")
;

ALTER TABLE "PolicyAssignment"
	ADD CONSTRAINT "PolicyAssignment_policyGroupId_fk"
	FOREIGN KEY ("policyGroupId")
	REFERENCES "PolicyGroup" ("id")
;

ALTER TABLE "CancellationTier"
	ADD CONSTRAINT "CancellationTier_policyId_fk"
	FOREIGN KEY ("policyId")
	REFERENCES "Policy" ("id")
;

ALTER TABLE "PolicyRule"
	ADD CONSTRAINT "PolicyRule_policyId_fk"
	FOREIGN KEY ("policyId")
	REFERENCES "Policy" ("id")
;

ALTER TABLE "PolicyExceptionRule"
	ADD CONSTRAINT "PolicyExceptionRule_createdBy_fk"
	FOREIGN KEY ("createdBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "PolicyAuditLog"
	ADD CONSTRAINT "PolicyAuditLog_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "PolicyAuditLog"
	ADD CONSTRAINT "PolicyAuditLog_policyId_fk"
	FOREIGN KEY ("policyId")
	REFERENCES "Policy" ("id")
;

ALTER TABLE "PolicyAuditLog"
	ADD CONSTRAINT "PolicyAuditLog_policyGroupId_fk"
	FOREIGN KEY ("policyGroupId")
	REFERENCES "PolicyGroup" ("id")
;

ALTER TABLE "PolicyAuditLog"
	ADD CONSTRAINT "PolicyAuditLog_assignmentId_fk"
	FOREIGN KEY ("assignmentId")
	REFERENCES "PolicyAssignment" ("id")
;

ALTER TABLE "VariantInventoryConfig"
	ADD CONSTRAINT "VariantInventoryConfig_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "DailyInventory"
	ADD CONSTRAINT "DailyInventory_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "EffectiveAvailability"
	ADD CONSTRAINT "EffectiveAvailability_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "InventoryLock"
	ADD CONSTRAINT "InventoryLock_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "InventoryLock"
	ADD CONSTRAINT "InventoryLock_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "Hold"
	ADD CONSTRAINT "Hold_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "Hold"
	ADD CONSTRAINT "Hold_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "SearchUnitView"
	ADD CONSTRAINT "SearchUnitView_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "SearchUnitView"
	ADD CONSTRAINT "SearchUnitView_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "SearchUnitView"
	ADD CONSTRAINT "SearchUnitView_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "RatePlan"
	ADD CONSTRAINT "RatePlan_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "RatePlanOccupancyPolicy"
	ADD CONSTRAINT "RatePlanOccupancyPolicy_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "CommercialRuleSet"
	ADD CONSTRAINT "CommercialRuleSet_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "CommercialRule"
	ADD CONSTRAINT "CommercialRule_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "CommercialRule"
	ADD CONSTRAINT "CommercialRule_ruleSetId_fk"
	FOREIGN KEY ("ruleSetId")
	REFERENCES "CommercialRuleSet" ("id")
;

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_ruleSetId_fk"
	FOREIGN KEY ("ruleSetId")
	REFERENCES "CommercialRuleSet" ("id")
;

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_ruleId_fk"
	FOREIGN KEY ("ruleId")
	REFERENCES "CommercialRule" ("id")
;

ALTER TABLE "EffectiveRestriction"
	ADD CONSTRAINT "EffectiveRestriction_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "EffectiveRestriction"
	ADD CONSTRAINT "EffectiveRestriction_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "EffectivePricingV2"
	ADD CONSTRAINT "EffectivePricingV2_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "EffectivePricingV2"
	ADD CONSTRAINT "EffectivePricingV2_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "TaxFeeDefinition"
	ADD CONSTRAINT "TaxFeeDefinition_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TaxFeeAssignment"
	ADD CONSTRAINT "TaxFeeAssignment_taxFeeDefinitionId_fk"
	FOREIGN KEY ("taxFeeDefinitionId")
	REFERENCES "TaxFeeDefinition" ("id")
;

ALTER TABLE "BookingTaxFee"
	ADD CONSTRAINT "BookingTaxFee_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
;

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_checkedInBy_fk"
	FOREIGN KEY ("checkedInBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_checkedOutBy_fk"
	FOREIGN KEY ("checkedOutBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_noShowBy_fk"
	FOREIGN KEY ("noShowBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "BookingRoomDetail"
	ADD CONSTRAINT "BookingRoomDetail_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "BookingRoomDetail"
	ADD CONSTRAINT "BookingRoomDetail_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "BookingRoomDetail"
	ADD CONSTRAINT "BookingRoomDetail_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "BookingPolicySnapshot"
	ADD CONSTRAINT "BookingPolicySnapshot_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "BookingPolicySnapshot"
	ADD CONSTRAINT "BookingPolicySnapshot_policyId_fk"
	FOREIGN KEY ("policyId")
	REFERENCES "Policy" ("id")
;



CREATE INDEX "ProviderDocument_providerId_type_idx" ON "ProviderDocument" ("providerId", "type");

CREATE INDEX "ProviderDocument_providerId_status_idx" ON "ProviderDocument" ("providerId", "status");

CREATE INDEX "ProviderTaxConfiguration_status_idx" ON "ProviderTaxConfiguration" ("status");

CREATE INDEX "ProviderTaxConfiguration_taxResidenceCountry_idx" ON "ProviderTaxConfiguration" ("taxResidenceCountry");

CREATE INDEX "ProviderPaymentAccount_providerId_status_idx" ON "ProviderPaymentAccount" ("providerId", "status");

CREATE INDEX "ProviderPaymentAccount_providerId_provider_idx" ON "ProviderPaymentAccount" ("providerId", "provider");

CREATE INDEX "ProviderPaymentAccount_country_idx" ON "ProviderPaymentAccount" ("country");

CREATE UNIQUE INDEX "ProviderIntegrationConnection_provider_connector_unique" ON "ProviderIntegrationConnection" ("providerId", "connectorKey");

CREATE INDEX "ProviderIntegrationConnection_providerId_status_idx" ON "ProviderIntegrationConnection" ("providerId", "status");

CREATE INDEX "ProviderIntegrationSyncLog_provider_connector_created_idx" ON "ProviderIntegrationSyncLog" ("providerId", "connectorKey", "createdAt");

CREATE INDEX "ProviderIntegrationSyncLog_provider_status_idx" ON "ProviderIntegrationSyncLog" ("providerId", "status");

CREATE INDEX "ProviderAuditLog_provider_created_idx" ON "ProviderAuditLog" ("providerId", "createdAt");

CREATE INDEX "ProviderAuditLog_provider_entity_type_idx" ON "ProviderAuditLog" ("providerId", "entityType");

CREATE INDEX "ProviderComplianceAssignment_provider_domain_status_idx" ON "ProviderComplianceAssignment" ("providerId", "domain", "status");

CREATE INDEX "ProviderComplianceAssignment_slaDueAt_idx" ON "ProviderComplianceAssignment" ("slaDueAt");

CREATE INDEX "ProviderComplianceAssignment_provider_entity_idx" ON "ProviderComplianceAssignment" ("providerId", "entityId");

CREATE INDEX "ProviderConfigurationState_canPublish_idx" ON "ProviderConfigurationState" ("canPublish");

CREATE INDEX "ProviderConfigurationState_canAcceptBookings_idx" ON "ProviderConfigurationState" ("canAcceptBookings");

CREATE INDEX "ProviderConfigurationState_canCollectPayments_idx" ON "ProviderConfigurationState" ("canCollectPayments");

CREATE INDEX "ProviderVerification_providerId_status_idx" ON "ProviderVerification" ("providerId", "status");

CREATE UNIQUE INDEX "ProviderUser_providerId_userId_unique" ON "ProviderUser" ("providerId", "userId");

CREATE INDEX "ProviderInvitation_providerId_status_idx" ON "ProviderInvitation" ("providerId", "status");

CREATE INDEX "ProviderInvitation_providerId_email_idx" ON "ProviderInvitation" ("providerId", "email");

CREATE UNIQUE INDEX "User_email_unique" ON "User" ("email");

CREATE UNIQUE INDEX "User_username_unique" ON "User" ("username");

CREATE INDEX "ProviderFinancialProfile_status_idx" ON "ProviderFinancialProfile" ("status");

CREATE INDEX "ProviderFinancialProfile_taxProfileStatus_idx" ON "ProviderFinancialProfile" ("taxProfileStatus");

CREATE INDEX "ProviderPayableSnapshot_booking_provider_idx" ON "ProviderPayableSnapshot" ("bookingId", "providerId");

CREATE INDEX "ProviderPayableSnapshot_provider_snapshot_idx" ON "ProviderPayableSnapshot" ("providerId", "snapshotAt");

CREATE INDEX "ProviderStatement_provider_status_idx" ON "ProviderStatement" ("providerId", "status");

CREATE INDEX "ProviderStatement_statementReference_idx" ON "ProviderStatement" ("statementReference");

CREATE UNIQUE INDEX "Destination_slug_unique" ON "Destination" ("slug");

CREATE INDEX "Image_entityType_entityId_idx" ON "Image" ("entityType", "entityId");

CREATE INDEX "Image_entityId_idx" ON "Image" ("entityId");

CREATE INDEX "ImageUpload_objectKey_status_idx" ON "ImageUpload" ("objectKey", "status");

CREATE UNIQUE INDEX "Translation_record_language_unique" ON "Translation" ("tableRef", "columnRef", "recordId", "languageCode");

CREATE INDEX "Product_providerId_productType_idx" ON "Product" ("providerId", "productType");

CREATE INDEX "Product_providerId_idx" ON "Product" ("providerId");

CREATE INDEX "HouseRule_productId_type_idx" ON "HouseRule" ("productId", "type");

CREATE INDEX "ProductPreparationSnapshot_provider_updated_idx" ON "ProductPreparationSnapshot" ("providerId", "updatedAt");

CREATE INDEX "ProductPreparationSnapshot_provider_ready_idx" ON "ProductPreparationSnapshot" ("providerId", "readyToPublish");

CREATE INDEX "ProductPreparationSnapshot_provider_status_idx" ON "ProductPreparationSnapshot" ("providerId", "status");

CREATE INDEX "Variant_productId_isActive_idx" ON "Variant" ("productId", "isActive");

CREATE INDEX "Variant_productId_kind_idx" ON "Variant" ("productId", "kind");

CREATE INDEX "VariantRoomProfile_roomTypeId_idx" ON "VariantRoomProfile" ("roomTypeId");

CREATE INDEX "VariantRoomBed_variantId_idx" ON "VariantRoomBed" ("variantId");

CREATE UNIQUE INDEX "VariantRoomAmenity_variantId_amenityId_unique" ON "VariantRoomAmenity" ("variantId", "amenityId");

CREATE UNIQUE INDEX "ProductService_productId_serviceId_unique" ON "ProductService" ("productId", "serviceId");

CREATE INDEX "ProductServiceAttribute_productServiceId_key_idx" ON "ProductServiceAttribute" ("productServiceId", "key");

CREATE INDEX "PolicyGroup_ownerProviderId_category_idx" ON "PolicyGroup" ("ownerProviderId", "category");

CREATE UNIQUE INDEX "Policy_groupId_version_unique" ON "Policy" ("groupId", "version");

CREATE INDEX "Policy_groupId_status_version_idx" ON "Policy" ("groupId", "status", "version");

CREATE INDEX "Policy_groupId_status_effective_range_idx" ON "Policy" ("groupId", "status", "effectiveFrom", "effectiveTo");

CREATE INDEX "Policy_groupId_preset_status_idx" ON "Policy" ("groupId", "policyPresetKey", "status");

CREATE INDEX "PolicyAssignment_scope_resolution_idx" ON "PolicyAssignment" ("scope", "scopeId", "category", "channel", "isActive");

CREATE INDEX "PolicyAssignment_scope_active_range_idx" ON "PolicyAssignment" ("scope", "scopeId", "category", "isActive", "effectiveFrom", "effectiveTo");

CREATE INDEX "PolicyAssignment_effective_range_idx" ON "PolicyAssignment" ("effectiveFrom", "effectiveTo");

CREATE INDEX "PolicyAssignment_group_active_idx" ON "PolicyAssignment" ("policyGroupId", "isActive");

CREATE UNIQUE INDEX "CancellationTier_policyId_daysBeforeArrival_unique" ON "CancellationTier" ("policyId", "daysBeforeArrival");

CREATE UNIQUE INDEX "PolicyRule_policyId_ruleKey_unique" ON "PolicyRule" ("policyId", "ruleKey");

CREATE INDEX "PolicyExceptionRule_context_type_active_idx" ON "PolicyExceptionRule" ("scope", "scopeId", "category", "type", "isActive");

CREATE INDEX "PolicyExceptionRule_context_priority_idx" ON "PolicyExceptionRule" ("scope", "scopeId", "isActive", "priority");

CREATE INDEX "PolicyExceptionRule_category_active_idx" ON "PolicyExceptionRule" ("category", "isActive");

CREATE INDEX "PolicyExceptionRule_effective_range_idx" ON "PolicyExceptionRule" ("effectiveFrom", "effectiveTo");

CREATE INDEX "PolicyAuditLog_event_created_idx" ON "PolicyAuditLog" ("eventType", "createdAt");

CREATE INDEX "PolicyAuditLog_policyGroupId_idx" ON "PolicyAuditLog" ("policyGroupId");

CREATE INDEX "PolicyAuditLog_scope_scopeId_idx" ON "PolicyAuditLog" ("scope", "scopeId");

CREATE UNIQUE INDEX "DailyInventory_variantId_date_unique" ON "DailyInventory" ("variantId", "date");

CREATE UNIQUE INDEX "EffectiveAvailability_variantId_date_unique" ON "EffectiveAvailability" ("variantId", "date");

CREATE INDEX "InventoryLock_variantId_date_idx" ON "InventoryLock" ("variantId", "date");

CREATE INDEX "InventoryLock_holdId_idx" ON "InventoryLock" ("holdId");

CREATE INDEX "Hold_variantId_checkIn_idx" ON "Hold" ("variantId", "checkIn");

CREATE INDEX "Hold_expiresAt_idx" ON "Hold" ("expiresAt");

CREATE UNIQUE INDEX "SearchUnitView_variant_rate_date_occupancy_unique" ON "SearchUnitView" ("variantId", "ratePlanId", "date", "occupancyKey");

CREATE INDEX "SearchUnitView_product_date_occupancy_idx" ON "SearchUnitView" ("productId", "date", "occupancyKey");

CREATE INDEX "SearchUnitView_variant_date_idx" ON "SearchUnitView" ("variantId", "date");

CREATE INDEX "SearchUnitView_blocker_price_idx" ON "SearchUnitView" ("primaryBlocker", "pricePerNight");

CREATE INDEX "RatePlan_variantId_isActive_idx" ON "RatePlan" ("variantId", "isActive");

CREATE INDEX "RatePlan_variantId_isDefault_isActive_idx" ON "RatePlan" ("variantId", "isDefault", "isActive");

CREATE INDEX "RatePlanOccupancyPolicy_ratePlan_effective_idx" ON "RatePlanOccupancyPolicy" ("ratePlanId", "effectiveFrom", "effectiveTo");

CREATE INDEX "CommercialRuleSet_provider_status_idx" ON "CommercialRuleSet" ("providerId", "status");

CREATE INDEX "CommercialRuleSet_provider_date_range_idx" ON "CommercialRuleSet" ("providerId", "dateFrom", "dateTo");

CREATE INDEX "CommercialRule_provider_category_type_idx" ON "CommercialRule" ("providerId", "category", "type");

CREATE INDEX "CommercialRule_ruleSetId_isActive_idx" ON "CommercialRule" ("ruleSetId", "isActive");

CREATE INDEX "CommercialRuleApplication_provider_scope_active_idx" ON "CommercialRuleApplication" ("providerId", "scope", "scopeId", "isActive");

CREATE INDEX "CommercialRuleApplication_rule_scope_idx" ON "CommercialRuleApplication" ("ruleId", "scope", "scopeId");

CREATE INDEX "CommercialRuleApplication_ruleSet_active_idx" ON "CommercialRuleApplication" ("ruleSetId", "isActive");

CREATE UNIQUE INDEX "EffectiveRestriction_variant_rate_date_unique" ON "EffectiveRestriction" ("variantId", "ratePlanId", "date");

CREATE INDEX "EffectiveRestriction_variant_date_idx" ON "EffectiveRestriction" ("variantId", "date");

CREATE INDEX "EffectiveRestriction_ratePlan_date_idx" ON "EffectiveRestriction" ("ratePlanId", "date");

CREATE UNIQUE INDEX "EffectivePricingV2_variant_rate_date_occupancy_unique" ON "EffectivePricingV2" ("variantId", "ratePlanId", "date", "occupancyKey");

CREATE INDEX "EffectivePricingV2_ratePlan_date_idx" ON "EffectivePricingV2" ("ratePlanId", "date");

CREATE INDEX "EffectivePricingV2_variant_date_occupancy_idx" ON "EffectivePricingV2" ("variantId", "date", "occupancyKey");

CREATE INDEX "BookingTaxFee_bookingId_idx" ON "BookingTaxFee" ("bookingId");

CREATE INDEX "Booking_provider_status_checkin_idx" ON "Booking" ("providerId", "status", "checkInDate");

CREATE INDEX "Booking_provider_operation_checkout_idx" ON "Booking" ("providerId", "operationalStatus", "checkOutDate");

CREATE INDEX "Booking_ratePlanId_idx" ON "Booking" ("ratePlanId");

CREATE INDEX "BookingRoomDetail_bookingId_idx" ON "BookingRoomDetail" ("bookingId");

CREATE INDEX "BookingRoomDetail_variantId_idx" ON "BookingRoomDetail" ("variantId");

CREATE INDEX "BookingRoomDetail_ratePlanId_idx" ON "BookingRoomDetail" ("ratePlanId");

CREATE UNIQUE INDEX "BookingPolicySnapshot_bookingId_category_unique" ON "BookingPolicySnapshot" ("bookingId", "category");

CREATE INDEX "FinancialExceptionRecord_bookingId_idx" ON "FinancialExceptionRecord" ("bookingId");

CREATE INDEX "FinancialExceptionRecord_booking_code_idx" ON "FinancialExceptionRecord" ("bookingId", "code");

CREATE INDEX "FinancialExceptionRecord_provider_status_idx" ON "FinancialExceptionRecord" ("providerId", "status");

CREATE INDEX "FinancialExceptionRecord_provider_code_status_idx" ON "FinancialExceptionRecord" ("providerId", "code", "status");

CREATE INDEX "FinancialExceptionRecord_provider_owner_status_idx" ON "FinancialExceptionRecord" ("providerId", "nextOwner", "status");

CREATE INDEX "FinancialExceptionRecord_openedAt_idx" ON "FinancialExceptionRecord" ("openedAt");

CREATE INDEX "FinancialReference_bookingId_idx" ON "FinancialReference" ("bookingId");

CREATE INDEX "FinancialReference_booking_type_idx" ON "FinancialReference" ("bookingId", "type");

CREATE INDEX "FinancialReference_provider_type_idx" ON "FinancialReference" ("providerId", "type");

CREATE INDEX "FinancialReference_value_idx" ON "FinancialReference" ("referenceValue");

CREATE INDEX "RefundHandoffRecord_bookingId_idx" ON "RefundHandoffRecord" ("bookingId");

CREATE INDEX "RefundHandoffRecord_provider_status_idx" ON "RefundHandoffRecord" ("providerId", "status");

CREATE INDEX "RefundHandoffRecord_provider_owner_status_idx" ON "RefundHandoffRecord" ("providerId", "nextOwner", "status");

CREATE INDEX "RefundHandoffRecord_openedAt_idx" ON "RefundHandoffRecord" ("openedAt");

CREATE INDEX "RefundQuote_bookingId_idx" ON "RefundQuote" ("bookingId");

CREATE INDEX "RefundQuote_provider_status_idx" ON "RefundQuote" ("providerId", "status");

CREATE UNIQUE INDEX "RefundQuote_idempotencyKey_unique" ON "RefundQuote" ("idempotencyKey");

CREATE INDEX "RefundQuote_quotedAt_idx" ON "RefundQuote" ("quotedAt");

CREATE INDEX "RefundLedger_bookingId_idx" ON "RefundLedger" ("bookingId");

CREATE INDEX "RefundLedger_provider_status_idx" ON "RefundLedger" ("providerId", "status");

CREATE UNIQUE INDEX "RefundLedger_refundQuoteId_unique" ON "RefundLedger" ("refundQuoteId");

CREATE INDEX "RefundLedger_paymentTransactionId_idx" ON "RefundLedger" ("paymentTransactionId");

CREATE INDEX "RefundLedger_appliedAt_idx" ON "RefundLedger" ("appliedAt");

CREATE INDEX "FinancialReviewEvent_bookingId_idx" ON "FinancialReviewEvent" ("bookingId");

CREATE INDEX "FinancialReviewEvent_provider_created_idx" ON "FinancialReviewEvent" ("providerId", "createdAt");

CREATE INDEX "FinancialReviewEvent_financialExceptionId_idx" ON "FinancialReviewEvent" ("financialExceptionId");

CREATE INDEX "FinancialReviewEvent_financialReferenceId_idx" ON "FinancialReviewEvent" ("financialReferenceId");

CREATE INDEX "FinancialReviewEvent_refundHandoffId_idx" ON "FinancialReviewEvent" ("refundHandoffId");

CREATE INDEX "FinancialReviewEvent_reconciliationMatchId_idx" ON "FinancialReviewEvent" ("reconciliationMatchId");

CREATE INDEX "PaymentTransaction_bookingId_idx" ON "PaymentTransaction" ("bookingId");

CREATE INDEX "PaymentTransaction_provider_type_status_idx" ON "PaymentTransaction" ("providerId", "type", "status");

CREATE UNIQUE INDEX "PaymentTransaction_provider_psp_external_type_unique" ON "PaymentTransaction" ("providerId", "pspProvider", "externalReference", "type");

CREATE INDEX "PaymentTransaction_idempotencyKey_idx" ON "PaymentTransaction" ("idempotencyKey");

CREATE INDEX "PaymentTransaction_occurredAt_idx" ON "PaymentTransaction" ("occurredAt");

CREATE INDEX "FinancialSettlementRecord_bookingId_idx" ON "FinancialSettlementRecord" ("bookingId");

CREATE UNIQUE INDEX "FinancialSettlementRecord_provider_reference_unique" ON "FinancialSettlementRecord" ("providerId", "settlementReference");

CREATE INDEX "FinancialSettlementRecord_settlementDate_idx" ON "FinancialSettlementRecord" ("settlementDate");

CREATE INDEX "ReconciliationMatch_bookingId_idx" ON "ReconciliationMatch" ("bookingId");

CREATE INDEX "ReconciliationMatch_provider_status_idx" ON "ReconciliationMatch" ("providerId", "status");

CREATE INDEX "ReconciliationMatch_provider_reviewStatus_idx" ON "ReconciliationMatch" ("providerId", "reviewStatus");

CREATE INDEX "ReconciliationMatch_updatedAt_idx" ON "ReconciliationMatch" ("updatedAt");

CREATE INDEX "CommissionSnapshot_booking_provider_idx" ON "CommissionSnapshot" ("bookingId", "providerId");

CREATE INDEX "CommissionSnapshot_provider_snapshot_idx" ON "CommissionSnapshot" ("providerId", "snapshotAt");

CREATE INDEX "PayoutRecord_bookingId_idx" ON "PayoutRecord" ("bookingId");

CREATE INDEX "PayoutRecord_provider_status_idx" ON "PayoutRecord" ("providerId", "status");

CREATE INDEX "PayoutRecord_payoutReference_idx" ON "PayoutRecord" ("payoutReference");



-- Native PostgreSQL constraints, partial indexes and triggers.

-- Fastt Supabase integrity layer.
-- Apply after the Drizzle-generated PostgreSQL schema.

CREATE OR REPLACE FUNCTION fastt_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW."updatedAt" = now();
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_require_policy_assignment_category_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "PolicyGroup"
		WHERE "PolicyGroup"."id" = NEW."policyGroupId"
			AND "PolicyGroup"."category" = NEW."category"
	) THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_CATEGORY_MISMATCH';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_policy_group_category_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "PolicyAssignment"
		WHERE "PolicyAssignment"."policyGroupId" = NEW."id"
			AND "PolicyAssignment"."category" <> NEW."category"
	) THEN
		RAISE EXCEPTION 'POLICY_GROUP_CATEGORY_HAS_ASSIGNMENTS';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_policy_assignment_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."isActive" = true
		AND NEW."effectiveFrom" IS NOT NULL
		AND NEW."effectiveTo" IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM "PolicyAssignment" existing
			WHERE existing."id" <> NEW."id"
				AND existing."isActive" = true
				AND existing."scope" = NEW."scope"
				AND existing."scopeId" = NEW."scopeId"
				AND existing."category" = NEW."category"
				AND COALESCE(existing."channel", '__default__') = COALESCE(NEW."channel", '__default__')
				AND existing."effectiveFrom" IS NOT NULL
				AND existing."effectiveTo" IS NOT NULL
				AND daterange(existing."effectiveFrom", existing."effectiveTo", '[]')
					&& daterange(NEW."effectiveFrom", NEW."effectiveTo", '[]')
		) THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_ACTIVE_RANGE_OVERLAP';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_assert_positive_stay_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."checkOut" <= NEW."checkIn" THEN
		RAISE EXCEPTION 'INVALID_STAY_RANGE';
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_assert_positive_booking_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."checkOutDate" <= NEW."checkInDate" THEN
		RAISE EXCEPTION 'INVALID_BOOKING_DATE_RANGE';
	END IF;

	RETURN NEW;
END;
$$;

DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'ProviderDocument',
		'ProviderTaxConfiguration',
		'ProviderPaymentAccount',
		'ProviderIntegrationConnection',
		'ProviderComplianceAssignment',
		'ProviderConfigurationState',
		'ProviderInvitation',
		'ProductPreparationSnapshot',
		'VariantRoomProfile',
		'VariantReadiness',
		'DailyInventory',
		'CommercialRuleSet',
		'CommercialRule',
		'TaxFeeDefinition',
		'FinancialExceptionRecord',
		'RefundHandoffRecord',
		'PaymentTransaction',
		'ReconciliationMatch',
		'ProviderFinancialProfile',
		'ProviderPayableSnapshot',
		'PayoutRecord',
		'ProviderStatement'
	]
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_touch_updatedAt', table_name);
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fastt_touch_updated_at()',
			'trg_' || table_name || '_touch_updatedAt',
			table_name
		);
	END LOOP;
END;
$$;

ALTER TABLE "PolicyGroup"
	ADD CONSTRAINT "PolicyGroup_category_check"
	CHECK ("category" IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow'));

ALTER TABLE "Policy"
	ADD CONSTRAINT "Policy_status_check"
	CHECK ("status" IN ('draft', 'active', 'archived')),
	ADD CONSTRAINT "Policy_version_positive_check"
	CHECK ("version" >= 1),
	ADD CONSTRAINT "Policy_effective_range_check"
	CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

ALTER TABLE "PolicyAssignment"
	ADD CONSTRAINT "PolicyAssignment_scope_check"
	CHECK ("scope" IN ('product', 'variant', 'rate_plan')),
	ADD CONSTRAINT "PolicyAssignment_category_check"
	CHECK ("category" IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow')),
	ADD CONSTRAINT "PolicyAssignment_effective_range_pair_check"
	CHECK (("effectiveFrom" IS NULL AND "effectiveTo" IS NULL) OR ("effectiveFrom" IS NOT NULL AND "effectiveTo" IS NOT NULL)),
	ADD CONSTRAINT "PolicyAssignment_effective_range_order_check"
	CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

ALTER TABLE "CancellationTier"
	ADD CONSTRAINT "CancellationTier_days_positive_check"
	CHECK ("daysBeforeArrival" >= 0),
	ADD CONSTRAINT "CancellationTier_penalty_type_check"
	CHECK ("penaltyType" IN ('percentage', 'fixed', 'nights', 'none')),
	ADD CONSTRAINT "CancellationTier_penalty_amount_check"
	CHECK ("penaltyAmount" IS NULL OR "penaltyAmount" >= 0);

ALTER TABLE "PolicyRule"
	ADD CONSTRAINT "PolicyRule_key_required_check"
	CHECK (length(trim("ruleKey")) > 0);

ALTER TABLE "VariantCapacity"
	ADD CONSTRAINT "VariantCapacity_occupancy_range_check"
	CHECK ("minOccupancy" >= 0 AND "maxOccupancy" >= "minOccupancy");

ALTER TABLE "VariantInventoryConfig"
	ADD CONSTRAINT "VariantInventoryConfig_positive_units_check"
	CHECK ("defaultTotalUnits" >= 0 AND "horizonDays" > 0);

ALTER TABLE "DailyInventory"
	ADD CONSTRAINT "DailyInventory_nonnegative_check"
	CHECK ("totalInventory" >= 0 AND "reservedCount" >= 0 AND "reservedCount" <= "totalInventory");

ALTER TABLE "EffectiveAvailability"
	ADD CONSTRAINT "EffectiveAvailability_nonnegative_check"
	CHECK (
		"totalUnits" >= 0
		AND "heldUnits" >= 0
		AND "bookedUnits" >= 0
		AND "availableUnits" >= 0
	);

ALTER TABLE "InventoryLock"
	ADD CONSTRAINT "InventoryLock_quantity_positive_check"
	CHECK ("quantity" > 0);

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_guest_counts_check"
	CHECK ("numAdults" >= 0 AND "numChildren" >= 0 AND ("numAdults" + "numChildren") > 0),
	ADD CONSTRAINT "Booking_total_nonnegative_check"
	CHECK ("totalAmount" >= 0);

ALTER TABLE "BookingRoomDetail"
	ADD CONSTRAINT "BookingRoomDetail_guest_counts_check"
	CHECK ("adults" >= 0 AND "children" >= 0 AND ("adults" + "children") > 0),
	ADD CONSTRAINT "BookingRoomDetail_amounts_nonnegative_check"
	CHECK ("subtotalAmount" >= 0 AND "taxAmount" >= 0 AND "totalAmount" >= 0);

ALTER TABLE "RatePlanOccupancyPolicy"
	ADD CONSTRAINT "RatePlanOccupancyPolicy_effective_range_check"
	CHECK ("effectiveFrom" <= "effectiveTo"),
	ADD CONSTRAINT "RatePlanOccupancyPolicy_occupancy_check"
	CHECK ("baseAdults" >= 0 AND "baseChildren" >= 0),
	ADD CONSTRAINT "RatePlanOccupancyPolicy_amounts_nonnegative_check"
	CHECK ("baseAmount" >= 0 AND "extraAdultValue" >= 0 AND "childValue" >= 0);

ALTER TABLE "CommercialRuleSet"
	ADD CONSTRAINT "CommercialRuleSet_date_range_check"
	CHECK ("dateFrom" IS NULL OR "dateTo" IS NULL OR "dateFrom" <= "dateTo");

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_date_range_check"
	CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate");

ALTER TABLE "EffectiveRestriction"
	ADD CONSTRAINT "EffectiveRestriction_stay_range_check"
	CHECK ("minStay" IS NULL OR "maxStay" IS NULL OR "minStay" <= "maxStay"),
	ADD CONSTRAINT "EffectiveRestriction_lead_range_check"
	CHECK ("minLeadTime" IS NULL OR "maxLeadTime" IS NULL OR "minLeadTime" <= "maxLeadTime");

ALTER TABLE "TaxFeeDefinition"
	ADD CONSTRAINT "TaxFeeDefinition_kind_check"
	CHECK ("kind" IN ('tax', 'fee')),
	ADD CONSTRAINT "TaxFeeDefinition_calculation_check"
	CHECK ("calculationType" IN ('percentage', 'fixed')),
	ADD CONSTRAINT "TaxFeeDefinition_value_nonnegative_check"
	CHECK ("value" >= 0),
	ADD CONSTRAINT "TaxFeeDefinition_effective_range_check"
	CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

CREATE UNIQUE INDEX IF NOT EXISTS "RatePlan_one_default_active_per_variant_idx"
	ON "RatePlan" ("variantId")
	WHERE "isDefault" = true AND "isActive" = true;

CREATE INDEX IF NOT EXISTS "PolicyAssignment_active_resolution_range_idx"
	ON "PolicyAssignment" ("scope", "scopeId", "category", "channel", "effectiveFrom", "effectiveTo")
	WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "SearchUnitView_available_search_idx"
	ON "SearchUnitView" ("productId", "date", "occupancyKey", "pricePerNight")
	WHERE "isAvailable" = true;

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_category_match_insert" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_category_match_insert"
BEFORE INSERT ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_require_policy_assignment_category_match();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_category_match_update" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_category_match_update"
BEFORE UPDATE OF "policyGroupId", "category" ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_require_policy_assignment_category_match();

DROP TRIGGER IF EXISTS "trg_PolicyGroup_category_drift_update" ON "PolicyGroup";
CREATE TRIGGER "trg_PolicyGroup_category_drift_update"
BEFORE UPDATE OF "category" ON "PolicyGroup"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_group_category_drift();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_overlap_insert" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_overlap_insert"
BEFORE INSERT ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();

DROP TRIGGER IF EXISTS "trg_PolicyAssignment_overlap_update" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_overlap_update"
BEFORE UPDATE OF "scope", "scopeId", "category", "channel", "effectiveFrom", "effectiveTo", "isActive"
ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();

DROP TRIGGER IF EXISTS "trg_Hold_positive_range" ON "Hold";
CREATE TRIGGER "trg_Hold_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "Hold"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_BookingRoomDetail_positive_range" ON "BookingRoomDetail";
CREATE TRIGGER "trg_BookingRoomDetail_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "BookingRoomDetail"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_Booking_positive_range" ON "Booking";
CREATE TRIGGER "trg_Booking_positive_range"
BEFORE INSERT OR UPDATE OF "checkInDate", "checkOutDate"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_booking_range();



COMMIT;

