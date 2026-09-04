-- Fastt Supabase initial schema.

-- Generated from src/shared/infrastructure/db/schema/tables.ts.

-- Do not reuse SQLite/Turso migration history for this baseline.



BEGIN;



CREATE TABLE "Provider" (
	"id" text PRIMARY KEY,
	"legalName" text,
	"displayName" text,
	"status" text,
	"accountPurpose" text NOT NULL DEFAULT 'commercial',
	"dataClassification" text NOT NULL DEFAULT 'production',
	"createdAt" timestamp with time zone
);

CREATE TABLE "ProviderProfile" (
	"providerId" text PRIMARY KEY,
	"timezone" text NOT NULL,
	"defaultCurrency" text NOT NULL DEFAULT 'USD',
	"supportEmail" text,
	"supportPhone" text,
	"governanceUpdatedAt" timestamp with time zone
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
	"displayName" text,
	"isPrimary" boolean NOT NULL DEFAULT false,
	"status" text NOT NULL DEFAULT 'not_configured',
	"mode" text NOT NULL DEFAULT 'sandbox',
	"scopesJson" jsonb,
	"endpointUrl" text,
	"vendorKey" text,
	"authType" text,
	"externalPropertyId" text,
	"catalogJson" jsonb,
	"lastCatalogSyncAt" timestamp with time zone,
	"lastSyncAt" timestamp with time zone,
	"lastSyncStatus" text,
	"errorMessage" text,
	"syncEnabled" boolean NOT NULL DEFAULT false,
	"syncIntervalMinutes" integer NOT NULL DEFAULT 1440,
	"nextSyncAt" timestamp with time zone,
	"lastAutomaticSyncAt" timestamp with time zone,
	"consecutiveFailures" integer NOT NULL DEFAULT 0,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationCredential" (
	"connectionId" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"authType" text NOT NULL,
	"encryptedJson" jsonb NOT NULL,
	"scopesJson" jsonb,
	"tokenExpiresAt" timestamp with time zone,
	"refreshAfterAt" timestamp with time zone,
	"lastRefreshedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationMapping" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectionId" text NOT NULL,
	"mappingType" text NOT NULL,
	"localEntityType" text NOT NULL,
	"localEntityId" text NOT NULL,
	"externalEntityType" text NOT NULL,
	"externalEntityId" text NOT NULL,
	"externalEntityName" text,
	"direction" text NOT NULL DEFAULT 'bidirectional',
	"status" text NOT NULL DEFAULT 'active',
	"metadataJson" jsonb,
	"lastVerifiedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationCertification" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectionId" text NOT NULL,
	"vendorKey" text NOT NULL,
	"fixtureProductId" text,
	"status" text NOT NULL DEFAULT 'draft',
	"suiteVersion" text,
	"createdBy" text,
	"activatedBy" text,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"evidenceManifestJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationSyncRun" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectionId" text NOT NULL,
	"certificationId" text,
	"connectorKey" text NOT NULL,
	"operation" text NOT NULL,
	"trigger" text NOT NULL DEFAULT 'manual',
	"status" text NOT NULL DEFAULT 'running',
	"idempotencyKey" text,
	"readCount" integer NOT NULL DEFAULT 0,
	"changedCount" integer NOT NULL DEFAULT 0,
	"skippedCount" integer NOT NULL DEFAULT 0,
	"failedCount" integer NOT NULL DEFAULT 0,
	"cursor" text,
	"errorCode" text,
	"errorMessage" text,
	"summaryJson" jsonb,
	"requestedBy" text,
	"startedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"finishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderIntegrationSyncJob" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectionId" text,
	"targetType" text NOT NULL DEFAULT 'connection',
	"targetId" text NOT NULL,
	"connectorKey" text NOT NULL,
	"operation" text NOT NULL DEFAULT 'connection_test',
	"status" text NOT NULL DEFAULT 'queued',
	"trigger" text NOT NULL DEFAULT 'scheduled',
	"priority" integer NOT NULL DEFAULT 100,
	"attempts" integer NOT NULL DEFAULT 0,
	"maxAttempts" integer NOT NULL DEFAULT 5,
	"runAfter" timestamp with time zone NOT NULL DEFAULT now(),
	"lockedAt" timestamp with time zone,
	"lockedBy" text,
	"idempotencyKey" text NOT NULL,
	"lastError" text,
	"payloadJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"finishedAt" timestamp with time zone
);

CREATE TABLE "ProviderIntegrationIncident" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectionId" text NOT NULL,
	"syncRunId" text,
	"mappingId" text,
	"dedupeKey" text NOT NULL,
	"code" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL DEFAULT 'warning',
	"status" text NOT NULL DEFAULT 'open',
	"title" text NOT NULL,
	"description" text NOT NULL,
	"actionLabel" text,
	"actionHref" text,
	"entityType" text,
	"entityId" text,
	"occurrenceCount" integer NOT NULL DEFAULT 1,
	"firstSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
	"lastSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
	"resolvedAt" timestamp with time zone,
	"resolvedBy" text,
	"resolutionNote" text,
	"notificationStatus" text NOT NULL DEFAULT 'pending',
	"notificationChannelsJson" jsonb,
	"notificationAttemptCount" integer NOT NULL DEFAULT 0,
	"notifiedAt" timestamp with time zone,
	"notificationError" text,
	"metadataJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderExternalCalendar" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"connectionId" text NOT NULL,
	"variantId" text NOT NULL,
	"resourceId" text,
	"name" text NOT NULL,
	"feedUrlEncrypted" jsonb NOT NULL,
	"feedUrlHost" text NOT NULL,
	"feedUrlFingerprint" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"lastSyncAt" timestamp with time zone,
	"lastSyncStatus" text,
	"lastError" text,
	"lastEventCount" integer NOT NULL DEFAULT 0,
	"etag" text,
	"lastModified" text,
	"syncEnabled" boolean NOT NULL DEFAULT true,
	"syncIntervalMinutes" integer NOT NULL DEFAULT 1440,
	"nextSyncAt" timestamp with time zone NOT NULL DEFAULT now(),
	"lastAutomaticSyncAt" timestamp with time zone,
	"consecutiveFailures" integer NOT NULL DEFAULT 0,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderExternalCalendarEvent" (
	"id" text PRIMARY KEY,
	"calendarId" text NOT NULL,
	"providerId" text NOT NULL,
	"variantId" text NOT NULL,
	"resourceId" text,
	"sourceKey" text NOT NULL,
	"externalUid" text NOT NULL,
	"summary" text,
	"startDate" date NOT NULL,
	"endDate" date NOT NULL,
	"sourceUpdatedAt" timestamp with time zone,
	"fingerprint" text NOT NULL,
	"isActive" boolean NOT NULL DEFAULT true,
	"firstSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
	"lastSeenAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderExternalCalendarConflict" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"calendarId" text NOT NULL,
	"variantId" text NOT NULL,
	"resourceId" text,
	"kind" text NOT NULL,
	"status" text NOT NULL DEFAULT 'open',
	"dedupeKey" text NOT NULL,
	"startDate" date NOT NULL,
	"endDate" date NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"actionLabel" text,
	"resolutionNote" text,
	"actedAt" timestamp with time zone,
	"actedBy" text,
	"firstSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
	"lastSeenAt" timestamp with time zone NOT NULL DEFAULT now(),
	"metadataJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderExternalCalendarExport" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"variantId" text NOT NULL,
	"label" text NOT NULL,
	"tokenHash" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"lastDownloadedAt" timestamp with time zone,
	"downloadCount" integer NOT NULL DEFAULT 0,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
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
	"readinessJson" jsonb,
	"countsJson" jsonb,
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
	"workspaceExperience" text NOT NULL DEFAULT 'essential',
	"workspaceExperienceUpdatedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProviderInvitation" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"token" text,
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

CREATE TABLE "GeoPlace" (
	"id" text PRIMARY KEY,
	"canonicalName" text NOT NULL,
	"normalizedName" text NOT NULL,
	"slug" text NOT NULL,
	"canonicalPath" text NOT NULL,
	"placeType" text NOT NULL,
	"countryCode" text NOT NULL,
	"parentId" text,
	"mergedIntoId" text,
	"centroidLat" real,
	"centroidLng" real,
	"boundingBoxJson" jsonb,
	"timezone" text,
	"status" text NOT NULL DEFAULT 'active',
	"source" text NOT NULL DEFAULT 'manual',
	"sourceRef" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "GeoPlaceClosure" (
	"ancestorId" text NOT NULL,
	"descendantId" text NOT NULL,
	"depth" integer NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "GeoPlaceAlias" (
	"id" text PRIMARY KEY,
	"placeId" text NOT NULL,
	"locale" text NOT NULL DEFAULT 'es',
	"alias" text NOT NULL,
	"normalizedAlias" text NOT NULL,
	"aliasType" text NOT NULL DEFAULT 'alternate',
	"isPreferred" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "GeoPlaceContent" (
	"id" text PRIMARY KEY,
	"placeId" text NOT NULL,
	"locale" text NOT NULL DEFAULT 'es',
	"title" text,
	"summary" text,
	"seoJson" jsonb,
	"heroImageId" text,
	"publicationStatus" text NOT NULL DEFAULT 'draft',
	"featuredRank" integer,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "GeoPlaceExternalId" (
	"id" text PRIMARY KEY,
	"placeId" text NOT NULL,
	"source" text NOT NULL,
	"externalId" text NOT NULL,
	"externalUrl" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
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

CREATE TABLE "Image" (
	"id" text PRIMARY KEY,
	"objectKey" text NOT NULL,
	"url" text NOT NULL
);

CREATE TABLE "ImageUpload" (
	"id" text PRIMARY KEY,
	"imageId" text NOT NULL,
	"objectKey" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"completedAt" timestamp with time zone
);

CREATE TABLE "ProductImage" (
	"productId" text NOT NULL,
	"imageId" text NOT NULL,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isPrimary" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "VariantImage" (
	"variantId" text NOT NULL,
	"imageId" text NOT NULL,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isPrimary" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "Product" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"productType" text NOT NULL,
	"creationDate" timestamp with time zone NOT NULL DEFAULT now(),
	"lastUpdated" timestamp with time zone NOT NULL DEFAULT now(),
	"providerId" text NOT NULL,
	"dataClass" text NOT NULL DEFAULT 'production',
	"publicationState" text NOT NULL DEFAULT 'draft',
	"publicationValidationErrorsJson" jsonb,
	"publicationUpdatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductGeoPlace" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"placeId" text NOT NULL,
	"role" text NOT NULL DEFAULT 'primary_discovery',
	"isPrimary" boolean NOT NULL DEFAULT false,
	"source" text NOT NULL DEFAULT 'manual',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductGeoPlaceActivity" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"previousPlaceId" text,
	"placeId" text NOT NULL,
	"actorId" text,
	"source" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "MarketplaceCommercialCertificationRun" (
	"id" text PRIMARY KEY,
	"suiteVersion" text NOT NULL,
	"status" text NOT NULL DEFAULT 'prepared',
	"providerId" text,
	"hotelProductId" text,
	"tourProductId" text,
	"checkIn" date,
	"checkOut" date,
	"evidenceJson" jsonb NOT NULL,
	"failureJson" jsonb,
	"startedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductOperationalSurface" (
	"productId" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"productName" text NOT NULL,
	"productType" text NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"preparationStatusLabel" text NOT NULL DEFAULT 'En preparación',
	"preparationStatusVariant" text NOT NULL DEFAULT 'warning',
	"isPublished" boolean NOT NULL DEFAULT false,
	"readinessPercent" integer NOT NULL DEFAULT 0,
	"blockerCount" integer NOT NULL DEFAULT 0,
	"blockerPreviewJson" jsonb,
	"readyToPublish" boolean NOT NULL DEFAULT false,
	"continuePreparationHref" text NOT NULL,
	"previewHref" text NOT NULL,
	"nextStepLabel" text,
	"preparationUpdatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"subtypeSummary" text,
	"imagePreviewJson" jsonb,
	"coverImageJson" jsonb,
	"variantCount" integer NOT NULL DEFAULT 0,
	"activeVariantCount" integer NOT NULL DEFAULT 0,
	"defaultRatePlanIdsJson" jsonb,
	"policyCoverageStateJson" jsonb,
	"conditionsHref" text,
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "HouseRule" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"scope" text NOT NULL DEFAULT 'product',
	"scopeId" text,
	"type" text NOT NULL,
	"payloadJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductContent" (
	"productId" text PRIMARY KEY,
	"description" text,
	"highlightsJson" jsonb,
	"seoJson" jsonb,
	"dataClass" text NOT NULL DEFAULT 'production'
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
	"durationMinutes" integer,
	"difficultyLevel" text,
	"meetingPointJson" jsonb,
	"itineraryJson" jsonb,
	"safetyJson" jsonb,
	"guideJson" jsonb,
	"includesJson" jsonb,
	"excludesJson" jsonb,
	"pickupJson" jsonb
);

CREATE TABLE "TourSlotProfile" (
	"variantId" text PRIMARY KEY,
	"departureTime" text NOT NULL,
	"durationMinutes" integer,
	"maxPax" integer NOT NULL,
	"languageCode" text NOT NULL,
	"bookingMode" text NOT NULL DEFAULT 'shared',
	"meetingPointOverrideJson" jsonb,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TourDepartureInstance" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"variantId" text NOT NULL,
	"date" date NOT NULL,
	"departureTimeOverride" text,
	"meetingPointOverrideJson" jsonb,
	"notes" text,
	"isCancelled" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TourOperationalResource" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"userId" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"languagesJson" jsonb,
	"capacity" integer,
	"credentialsJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TourResourceAssignment" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"variantId" text NOT NULL,
	"date" date NOT NULL,
	"resourceId" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL DEFAULT 'assigned',
	"assignedBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TourTicketType" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"minAge" integer,
	"maxAge" integer,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TourBookingQuestion" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"isRequired" boolean NOT NULL DEFAULT false,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TourPrivateRequest" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"variantId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text,
	"departureDate" date NOT NULL,
	"partyJson" jsonb NOT NULL,
	"contactName" text NOT NULL,
	"contactEmail" text NOT NULL,
	"contactPhone" text,
	"message" text,
	"status" text NOT NULL DEFAULT 'pending',
	"slaDueAt" timestamp with time zone,
	"providerNote" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
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
	"createdAt" timestamp with time zone,
	"confirmationType" text NOT NULL DEFAULT 'instant',
	"externalCode" text,
	"lifecycleState" text NOT NULL DEFAULT 'draft',
	"salesEnabled" boolean NOT NULL DEFAULT false,
	"lifecycleValidationErrorsJson" jsonb,
	"lifecycleEvaluatedAt" timestamp with time zone NOT NULL DEFAULT now()
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

CREATE TABLE "ProductCategory" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"vertical" text NOT NULL,
	"sortOrder" integer NOT NULL DEFAULT 0,
	"isActive" boolean NOT NULL DEFAULT true,
	"dataClass" text NOT NULL DEFAULT 'production',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductCategoryLink" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"categoryId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ProductReview" (
	"id" text PRIMARY KEY,
	"productId" text NOT NULL,
	"userId" text,
	"bookingId" text,
	"rating" integer NOT NULL,
	"body" text,
	"status" text NOT NULL DEFAULT 'pending',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "MarketplaceEvent" (
	"id" text PRIMARY KEY,
	"eventType" text NOT NULL,
	"surface" text NOT NULL,
	"sourceProductId" text,
	"targetProductId" text,
	"geoPlaceId" text,
	"bookingId" text,
	"sessionId" text,
	"metaJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
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
	"productTargetId" text,
	"variantTargetId" text,
	"ratePlanTargetId" text,
	"scopeId" text GENERATED ALWAYS AS (coalesce("productTargetId", "variantTargetId", "ratePlanTargetId")) STORED,
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
	"hoursBeforeDeparture" integer,
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
	"productTargetId" text,
	"variantTargetId" text,
	"ratePlanTargetId" text,
	"scopeId" text GENERATED ALWAYS AS (coalesce("productTargetId", "variantTargetId", "ratePlanTargetId")) STORED,
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

CREATE TABLE "CompliancePolicySet" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"country" text NOT NULL,
	"vertical" text NOT NULL,
	"collectionModel" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CompliancePolicyVersion" (
	"id" text PRIMARY KEY,
	"policySetId" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"effectiveFrom" timestamp with time zone NOT NULL,
	"effectiveTo" timestamp with time zone,
	"approvedBy" text,
	"approvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ComplianceRequirementRule" (
	"id" text PRIMARY KEY,
	"policyVersionId" text NOT NULL,
	"domain" text NOT NULL,
	"requirementKey" text NOT NULL,
	"required" boolean NOT NULL DEFAULT true,
	"conditionJson" jsonb,
	"slaHours" integer NOT NULL DEFAULT 48,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ComplianceDecisionReason" (
	"id" text PRIMARY KEY,
	"policyVersionId" text NOT NULL,
	"code" text NOT NULL,
	"domain" text,
	"decision" text NOT NULL,
	"label" text NOT NULL,
	"requiresComment" boolean NOT NULL DEFAULT false,
	"active" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "ComplianceCase" (
	"id" text PRIMARY KEY,
	"caseNumber" text NOT NULL,
	"providerId" text NOT NULL,
	"caseType" text NOT NULL DEFAULT 'provider_compliance',
	"domain" text NOT NULL,
	"status" text NOT NULL DEFAULT 'open',
	"stage" text NOT NULL DEFAULT 'triage',
	"priority" text NOT NULL DEFAULT 'normal',
	"riskTier" text NOT NULL DEFAULT 'standard',
	"sourceType" text NOT NULL,
	"sourceRef" text NOT NULL,
	"policyVersionId" text,
	"summary" text,
	"resolutionCode" text,
	"openedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"resolvedAt" timestamp with time zone,
	"closedAt" timestamp with time zone,
	"reopenedAt" timestamp with time zone,
	"version" integer NOT NULL DEFAULT 1,
	"createdBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CaseTask" (
	"id" text PRIMARY KEY,
	"caseId" text NOT NULL,
	"taskKey" text NOT NULL,
	"taskType" text NOT NULL DEFAULT 'review_requirement',
	"status" text NOT NULL DEFAULT 'open',
	"requirementKey" text,
	"assigneeEmail" text,
	"dueAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"blockedReasonCode" text,
	"version" integer NOT NULL DEFAULT 1,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CaseAssignmentEvent" (
	"id" text PRIMARY KEY,
	"caseId" text NOT NULL,
	"taskId" text,
	"eventType" text NOT NULL,
	"fromAssigneeEmail" text,
	"toAssigneeEmail" text,
	"reasonCode" text,
	"actorUserId" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CaseSlaTimer" (
	"id" text PRIMARY KEY,
	"caseId" text NOT NULL,
	"timerKey" text NOT NULL DEFAULT 'resolution',
	"policyKey" text NOT NULL,
	"status" text NOT NULL DEFAULT 'running',
	"startedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"dueAt" timestamp with time zone NOT NULL,
	"pausedAt" timestamp with time zone,
	"breachedAt" timestamp with time zone,
	"stoppedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CaseLink" (
	"id" text PRIMARY KEY,
	"fromCaseId" text NOT NULL,
	"toCaseId" text NOT NULL,
	"linkType" text NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "DomainEventOutbox" (
	"id" text PRIMARY KEY,
	"eventType" text NOT NULL,
	"aggregateType" text NOT NULL,
	"aggregateId" text NOT NULL,
	"dedupeKey" text NOT NULL,
	"payloadJson" jsonb NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"attempts" integer NOT NULL DEFAULT 0,
	"availableAt" timestamp with time zone NOT NULL DEFAULT now(),
	"lockedAt" timestamp with time zone,
	"lockedBy" text,
	"publishedAt" timestamp with time zone,
	"lastError" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "VariantInventoryConfig" (
	"variantId" text PRIMARY KEY,
	"defaultTotalUnits" integer NOT NULL,
	"horizonDays" integer NOT NULL DEFAULT 365,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "InventoryResource" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"variantId" text NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL DEFAULT 'active',
	"externalCode" text,
	"metadataJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
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
	"externalBlockedUnits" integer NOT NULL DEFAULT 0,
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
	"commercialSnapshotVersion" text NOT NULL,
	"priceQuoteId" text,
	"commercialSnapshotJson" jsonb,
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

CREATE TABLE "SearchMaterializationLog" (
	"id" text PRIMARY KEY,
	"runId" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"variantId" text,
	"productId" text,
	"fromDate" date,
	"toDate" date,
	"horizonDays" integer,
	"currency" text,
	"variantsScanned" integer NOT NULL DEFAULT 0,
	"rowsMaterialized" integer NOT NULL DEFAULT 0,
	"purgedRows" integer NOT NULL DEFAULT 0,
	"durationMs" integer,
	"errorMessage" text,
	"metadataJson" jsonb,
	"startedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"finishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
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

CREATE TABLE "RatePlanConditionState" (
	"id" text PRIMARY KEY,
	"ratePlanId" text NOT NULL,
	"providerId" text NOT NULL,
	"productId" text NOT NULL,
	"variantId" text NOT NULL,
	"channel" text NOT NULL DEFAULT 'web',
	"totalCategories" integer NOT NULL DEFAULT 0,
	"coveredCategories" integer NOT NULL DEFAULT 0,
	"missingCategoriesJson" jsonb NOT NULL,
	"conditionsComplete" boolean NOT NULL DEFAULT false,
	"summary" text NOT NULL,
	"policyCoverageUpdatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
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
	"idempotencyKey" text,
	"idempotencyPayloadHash" text,
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
	"productTargetId" text,
	"variantTargetId" text,
	"ratePlanTargetId" text,
	"scopeId" text GENERATED ALWAYS AS (coalesce("productTargetId", "variantTargetId", "ratePlanTargetId")) STORED,
	"startDate" date,
	"endDate" date,
	"validDays" jsonb,
	"channel" text,
	"isActive" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "PricingBulkOperationJob" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"requestedByUserId" text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"payloadHash" text NOT NULL,
	"operationType" text NOT NULL,
	"commandJson" jsonb NOT NULL,
	"status" text NOT NULL DEFAULT 'queued',
	"totalItems" integer NOT NULL DEFAULT 0,
	"pendingItems" integer NOT NULL DEFAULT 0,
	"runningItems" integer NOT NULL DEFAULT 0,
	"completedItems" integer NOT NULL DEFAULT 0,
	"succeededItems" integer NOT NULL DEFAULT 0,
	"failedItems" integer NOT NULL DEFAULT 0,
	"skippedItems" integer NOT NULL DEFAULT 0,
	"cancelledItems" integer NOT NULL DEFAULT 0,
	"attempts" integer NOT NULL DEFAULT 0,
	"maxAttempts" integer NOT NULL DEFAULT 3,
	"runAfter" timestamp with time zone NOT NULL DEFAULT now(),
	"lockedAt" timestamp with time zone,
	"lockedBy" text,
	"finalizationAttempts" integer NOT NULL DEFAULT 0,
	"finalizationMaxAttempts" integer NOT NULL DEFAULT 5,
	"finalizationErrorCode" text,
	"finalizationErrorDetail" text,
	"finalizationStartedAt" timestamp with time zone,
	"finalizationFinishedAt" timestamp with time zone,
	"materializationCompletedAt" timestamp with time zone,
	"cacheInvalidationCompletedAt" timestamp with time zone,
	"ariEnqueueCompletedAt" timestamp with time zone,
	"finalizationResultJson" jsonb,
	"requiresAttentionAt" timestamp with time zone,
	"finalErrorCode" text,
	"finalErrorDetail" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
);

CREATE TABLE "PricingBulkOperationItem" (
	"id" text PRIMARY KEY,
	"jobId" text NOT NULL,
	"ratePlanId" text NOT NULL,
	"productIdSnapshot" text NOT NULL,
	"productNameSnapshot" text,
	"variantIdSnapshot" text NOT NULL,
	"variantNameSnapshot" text,
	"status" text NOT NULL DEFAULT 'queued',
	"attempts" integer NOT NULL DEFAULT 0,
	"ruleId" text,
	"previewResultJson" jsonb,
	"materializationResultJson" jsonb,
	"errorCode" text,
	"errorDetail" text,
	"commercialImpactJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
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

CREATE TABLE "EffectivePricing" (
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
	"sourceVersion" text NOT NULL DEFAULT 'effective_pricing'
);

CREATE TABLE "TaxFeeDefinition" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
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
	"editingState" text NOT NULL DEFAULT 'draft',
	"currentVersionId" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TaxFeeDefinitionVersion" (
	"id" text PRIMARY KEY,
	"taxFeeDefinitionId" text NOT NULL,
	"version" integer NOT NULL,
	"publicationState" text NOT NULL,
	"snapshotJson" jsonb NOT NULL,
	"createdByUserId" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TaxFeeDefinitionDraft" (
	"definitionId" text PRIMARY KEY,
	"baseVersionId" text,
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
	"updatedByUserId" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "TaxFeeAssignment" (
	"id" text PRIMARY KEY,
	"taxFeeDefinitionId" text NOT NULL,
	"scope" text NOT NULL,
	"providerTargetId" text,
	"productTargetId" text,
	"variantTargetId" text,
	"ratePlanTargetId" text,
	"scopeId" text GENERATED ALWAYS AS (coalesce("providerTargetId", "productTargetId", "variantTargetId", "ratePlanTargetId")) STORED,
	"channel" text,
	"status" text NOT NULL DEFAULT 'active',
	"effectiveFrom" timestamp with time zone,
	"effectiveTo" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "FiscalActivityEvent" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"eventType" text NOT NULL,
	"definitionId" text,
	"definitionVersionId" text,
	"productId" text,
	"channel" text,
	"syncRunId" text,
	"actorUserId" text,
	"actorRole" text,
	"correlationId" text,
	"result" text NOT NULL DEFAULT 'succeeded',
	"riskLevel" text NOT NULL DEFAULT 'low',
	"beforeJson" jsonb,
	"afterJson" jsonb,
	"contextJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "FiscalExportJob" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"requestedByUserId" text,
	"format" text NOT NULL,
	"status" text NOT NULL DEFAULT 'requested',
	"from" date NOT NULL,
	"to" date NOT NULL,
	"correlationId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"completedAt" timestamp with time zone
);

CREATE TABLE "FiscalReconciliationCase" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"bookingId" text NOT NULL,
	"status" text NOT NULL DEFAULT 'open',
	"assigneeUserId" text,
	"resolutionComment" text,
	"evidenceJson" jsonb NOT NULL,
	"openedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"resolvedAt" timestamp with time zone,
	"resolvedByUserId" text
);

CREATE TABLE "FiscalChannelPublication" (
	"id" text PRIMARY KEY,
	"providerId" text NOT NULL,
	"definitionId" text NOT NULL,
	"definitionVersionId" text,
	"connectionId" text NOT NULL,
	"channel" text NOT NULL,
	"syncRunId" text,
	"status" text NOT NULL DEFAULT 'pending',
	"divergenceJson" jsonb,
	"payloadJson" jsonb,
	"confirmedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
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
	"guestExpectationsSnapshotJson" jsonb,
	"contractSnapshotVersion" text,
	"integrationConnectionId" text,
	"externalBookingId" text,
	"externalRevisionId" text,
	"externalRevisionAt" timestamp with time zone
);

CREATE TABLE "BookingVoucher" (
	"id" text PRIMARY KEY,
	"bookingId" text NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"issuedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"redeemedAt" timestamp with time zone,
	"instructionsJson" jsonb,
	"qrPayload" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "BookingLineItem" (
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
	"paymentTransactionId" text,
	"settlementRecordId" text,
	"type" text NOT NULL,
	"actorId" text,
	"actorType" text NOT NULL,
	"payloadJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "PaymentTransaction" (
	"id" text PRIMARY KEY,
	"bookingId" text,
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
	"bookingId" text,
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

CREATE TABLE "FinancialProviderSummary" (
	"providerId" text PRIMARY KEY,
	"summaryJson" jsonb NOT NULL,
	"collectionsJson" jsonb NOT NULL,
	"refundsJson" jsonb NOT NULL,
	"exceptionsJson" jsonb NOT NULL,
	"settlementsJson" jsonb NOT NULL,
	"computedAt" timestamp with time zone NOT NULL DEFAULT now(),
	"invalidatedAt" timestamp with time zone,
	"invalidationReason" text,
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

CREATE TABLE "InternalRole" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"isSystem" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "InternalPermission" (
	"key" text PRIMARY KEY,
	"label" text NOT NULL,
	"description" text,
	"isSensitive" boolean NOT NULL DEFAULT false,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "InternalRolePermission" (
	"roleId" text NOT NULL,
	"permissionKey" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "InternalUserRole" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"roleId" text NOT NULL,
	"scopeType" text NOT NULL DEFAULT 'global',
	"scopeId" text,
	"status" text NOT NULL DEFAULT 'active',
	"expiresAt" timestamp with time zone,
	"grantedByUserId" text,
	"revokedAt" timestamp with time zone,
	"revokedByUserId" text,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "InternalSecuritySession" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"sessionFingerprint" text NOT NULL,
	"mfaVerifiedAt" timestamp with time zone,
	"reauthenticatedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "AuditEvent" (
	"id" text PRIMARY KEY,
	"requestId" text NOT NULL,
	"actorUserId" text,
	"actorRoleKeysJson" jsonb,
	"providerId" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"outcome" text NOT NULL DEFAULT 'succeeded',
	"riskLevel" text NOT NULL DEFAULT 'low',
	"beforeJson" jsonb,
	"afterJson" jsonb,
	"contextJson" jsonb,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "SensitiveDataAccessEvent" (
	"id" text PRIMARY KEY,
	"auditEventId" text,
	"requestId" text NOT NULL,
	"actorUserId" text,
	"providerId" text,
	"resourceType" text NOT NULL,
	"resourceId" text,
	"accessType" text NOT NULL,
	"reason" text NOT NULL,
	"fieldsJson" jsonb,
	"success" boolean NOT NULL DEFAULT true,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "CommandIdempotency" (
	"id" text PRIMARY KEY,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"requestHash" text NOT NULL,
	"status" text NOT NULL DEFAULT 'started',
	"responseJson" jsonb,
	"actorUserId" text,
	"requestId" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL DEFAULT now(),
	"updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);



ALTER TABLE "ProviderProfile"
	ADD CONSTRAINT "ProviderProfile_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
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

ALTER TABLE "ProviderIntegrationCredential"
	ADD CONSTRAINT "ProviderIntegrationCredential_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderIntegrationCredential"
	ADD CONSTRAINT "ProviderIntegrationCredential_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationMapping"
	ADD CONSTRAINT "ProviderIntegrationMapping_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationMapping"
	ADD CONSTRAINT "ProviderIntegrationMapping_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderIntegrationCertification"
	ADD CONSTRAINT "ProviderIntegrationCertification_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationCertification"
	ADD CONSTRAINT "ProviderIntegrationCertification_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderIntegrationCertification"
	ADD CONSTRAINT "ProviderIntegrationCertification_fixtureProductId_fk"
	FOREIGN KEY ("fixtureProductId")
	REFERENCES "Product" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "ProviderIntegrationCertification"
	ADD CONSTRAINT "ProviderIntegrationCertification_createdBy_fk"
	FOREIGN KEY ("createdBy")
	REFERENCES "User" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "ProviderIntegrationCertification"
	ADD CONSTRAINT "ProviderIntegrationCertification_activatedBy_fk"
	FOREIGN KEY ("activatedBy")
	REFERENCES "User" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "ProviderIntegrationSyncRun"
	ADD CONSTRAINT "ProviderIntegrationSyncRun_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationSyncRun"
	ADD CONSTRAINT "ProviderIntegrationSyncRun_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderIntegrationSyncRun"
	ADD CONSTRAINT "ProviderIntegrationSyncRun_certificationId_fk"
	FOREIGN KEY ("certificationId")
	REFERENCES "ProviderIntegrationCertification" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "ProviderIntegrationSyncRun"
	ADD CONSTRAINT "ProviderIntegrationSyncRun_requestedBy_fk"
	FOREIGN KEY ("requestedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderIntegrationSyncJob"
	ADD CONSTRAINT "ProviderIntegrationSyncJob_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationSyncJob"
	ADD CONSTRAINT "ProviderIntegrationSyncJob_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_syncRunId_fk"
	FOREIGN KEY ("syncRunId")
	REFERENCES "ProviderIntegrationSyncRun" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_mappingId_fk"
	FOREIGN KEY ("mappingId")
	REFERENCES "ProviderIntegrationMapping" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "ProviderIntegrationIncident"
	ADD CONSTRAINT "ProviderIntegrationIncident_resolvedBy_fk"
	FOREIGN KEY ("resolvedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "ProviderExternalCalendar"
	ADD CONSTRAINT "ProviderExternalCalendar_resourceId_fk"
	FOREIGN KEY ("resourceId")
	REFERENCES "InventoryResource" ("id")
;

ALTER TABLE "ProviderExternalCalendarEvent"
	ADD CONSTRAINT "ProviderExternalCalendarEvent_calendarId_fk"
	FOREIGN KEY ("calendarId")
	REFERENCES "ProviderExternalCalendar" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderExternalCalendarEvent"
	ADD CONSTRAINT "ProviderExternalCalendarEvent_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderExternalCalendarEvent"
	ADD CONSTRAINT "ProviderExternalCalendarEvent_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "ProviderExternalCalendarEvent"
	ADD CONSTRAINT "ProviderExternalCalendarEvent_resourceId_fk"
	FOREIGN KEY ("resourceId")
	REFERENCES "InventoryResource" ("id")
;

ALTER TABLE "ProviderExternalCalendarConflict"
	ADD CONSTRAINT "ProviderExternalCalendarConflict_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderExternalCalendarConflict"
	ADD CONSTRAINT "ProviderExternalCalendarConflict_calendarId_fk"
	FOREIGN KEY ("calendarId")
	REFERENCES "ProviderExternalCalendar" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProviderExternalCalendarConflict"
	ADD CONSTRAINT "ProviderExternalCalendarConflict_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "ProviderExternalCalendarConflict"
	ADD CONSTRAINT "ProviderExternalCalendarConflict_resourceId_fk"
	FOREIGN KEY ("resourceId")
	REFERENCES "InventoryResource" ("id")
;

ALTER TABLE "ProviderExternalCalendarConflict"
	ADD CONSTRAINT "ProviderExternalCalendarConflict_actedBy_fk"
	FOREIGN KEY ("actedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProviderExternalCalendarExport"
	ADD CONSTRAINT "ProviderExternalCalendarExport_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderExternalCalendarExport"
	ADD CONSTRAINT "ProviderExternalCalendarExport_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
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

ALTER TABLE "ProviderPayableSnapshot"
	ADD CONSTRAINT "ProviderPayableSnapshot_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "ProviderPayableSnapshot"
	ADD CONSTRAINT "ProviderPayableSnapshot_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProviderStatement"
	ADD CONSTRAINT "ProviderStatement_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "GeoPlace"
	ADD CONSTRAINT "GeoPlace_parentId_fk"
	FOREIGN KEY ("parentId")
	REFERENCES "GeoPlace" ("id")
;

ALTER TABLE "GeoPlace"
	ADD CONSTRAINT "GeoPlace_mergedIntoId_fk"
	FOREIGN KEY ("mergedIntoId")
	REFERENCES "GeoPlace" ("id")
;

ALTER TABLE "GeoPlaceClosure"
	ADD CONSTRAINT "GeoPlaceClosure_ancestorId_fk"
	FOREIGN KEY ("ancestorId")
	REFERENCES "GeoPlace" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "GeoPlaceClosure"
	ADD CONSTRAINT "GeoPlaceClosure_descendantId_fk"
	FOREIGN KEY ("descendantId")
	REFERENCES "GeoPlace" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "GeoPlaceAlias"
	ADD CONSTRAINT "GeoPlaceAlias_placeId_fk"
	FOREIGN KEY ("placeId")
	REFERENCES "GeoPlace" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "GeoPlaceContent"
	ADD CONSTRAINT "GeoPlaceContent_placeId_fk"
	FOREIGN KEY ("placeId")
	REFERENCES "GeoPlace" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "GeoPlaceContent"
	ADD CONSTRAINT "GeoPlaceContent_heroImageId_fk"
	FOREIGN KEY ("heroImageId")
	REFERENCES "Image" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "GeoPlaceExternalId"
	ADD CONSTRAINT "GeoPlaceExternalId_placeId_fk"
	FOREIGN KEY ("placeId")
	REFERENCES "GeoPlace" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ImageUpload"
	ADD CONSTRAINT "ImageUpload_imageId_fk"
	FOREIGN KEY ("imageId")
	REFERENCES "Image" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProductImage"
	ADD CONSTRAINT "ProductImage_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProductImage"
	ADD CONSTRAINT "ProductImage_imageId_fk"
	FOREIGN KEY ("imageId")
	REFERENCES "Image" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "VariantImage"
	ADD CONSTRAINT "VariantImage_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "VariantImage"
	ADD CONSTRAINT "VariantImage_imageId_fk"
	FOREIGN KEY ("imageId")
	REFERENCES "Image" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "Product"
	ADD CONSTRAINT "Product_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ProductGeoPlace"
	ADD CONSTRAINT "ProductGeoPlace_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProductGeoPlace"
	ADD CONSTRAINT "ProductGeoPlace_placeId_fk"
	FOREIGN KEY ("placeId")
	REFERENCES "GeoPlace" ("id")
;

ALTER TABLE "ProductGeoPlaceActivity"
	ADD CONSTRAINT "ProductGeoPlaceActivity_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "ProductGeoPlaceActivity"
	ADD CONSTRAINT "ProductGeoPlaceActivity_previousPlaceId_fk"
	FOREIGN KEY ("previousPlaceId")
	REFERENCES "GeoPlace" ("id")
;

ALTER TABLE "ProductGeoPlaceActivity"
	ADD CONSTRAINT "ProductGeoPlaceActivity_placeId_fk"
	FOREIGN KEY ("placeId")
	REFERENCES "GeoPlace" ("id")
;

ALTER TABLE "ProductGeoPlaceActivity"
	ADD CONSTRAINT "ProductGeoPlaceActivity_actorId_fk"
	FOREIGN KEY ("actorId")
	REFERENCES "User" ("id")
;

ALTER TABLE "MarketplaceCommercialCertificationRun"
	ADD CONSTRAINT "MarketplaceCommercialCertificationRun_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "MarketplaceCommercialCertificationRun"
	ADD CONSTRAINT "MarketplaceCommercialCertificationRun_hotelProductId_fk"
	FOREIGN KEY ("hotelProductId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "MarketplaceCommercialCertificationRun"
	ADD CONSTRAINT "MarketplaceCommercialCertificationRun_tourProductId_fk"
	FOREIGN KEY ("tourProductId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductOperationalSurface"
	ADD CONSTRAINT "ProductOperationalSurface_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductOperationalSurface"
	ADD CONSTRAINT "ProductOperationalSurface_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "HouseRule"
	ADD CONSTRAINT "HouseRule_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "HouseRule"
	ADD CONSTRAINT "HouseRule_scopeId_fk"
	FOREIGN KEY ("scopeId")
	REFERENCES "Variant" ("id")
	ON DELETE CASCADE
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

ALTER TABLE "TourSlotProfile"
	ADD CONSTRAINT "TourSlotProfile_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "TourDepartureInstance"
	ADD CONSTRAINT "TourDepartureInstance_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TourDepartureInstance"
	ADD CONSTRAINT "TourDepartureInstance_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "TourOperationalResource"
	ADD CONSTRAINT "TourOperationalResource_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TourOperationalResource"
	ADD CONSTRAINT "TourOperationalResource_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
;

ALTER TABLE "TourResourceAssignment"
	ADD CONSTRAINT "TourResourceAssignment_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TourResourceAssignment"
	ADD CONSTRAINT "TourResourceAssignment_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "TourResourceAssignment"
	ADD CONSTRAINT "TourResourceAssignment_resourceId_fk"
	FOREIGN KEY ("resourceId")
	REFERENCES "TourOperationalResource" ("id")
;

ALTER TABLE "TourResourceAssignment"
	ADD CONSTRAINT "TourResourceAssignment_assignedBy_fk"
	FOREIGN KEY ("assignedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "TourTicketType"
	ADD CONSTRAINT "TourTicketType_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "TourBookingQuestion"
	ADD CONSTRAINT "TourBookingQuestion_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "TourPrivateRequest"
	ADD CONSTRAINT "TourPrivateRequest_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "TourPrivateRequest"
	ADD CONSTRAINT "TourPrivateRequest_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "TourPrivateRequest"
	ADD CONSTRAINT "TourPrivateRequest_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TourPrivateRequest"
	ADD CONSTRAINT "TourPrivateRequest_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
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

ALTER TABLE "ProductService"
	ADD CONSTRAINT "ProductService_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductServiceAttribute"
	ADD CONSTRAINT "ProductServiceAttribute_productServiceId_fk"
	FOREIGN KEY ("productServiceId")
	REFERENCES "ProductService" ("id")
;

ALTER TABLE "ProductCategoryLink"
	ADD CONSTRAINT "ProductCategoryLink_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductCategoryLink"
	ADD CONSTRAINT "ProductCategoryLink_categoryId_fk"
	FOREIGN KEY ("categoryId")
	REFERENCES "ProductCategory" ("id")
;

ALTER TABLE "ProductReview"
	ADD CONSTRAINT "ProductReview_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "ProductReview"
	ADD CONSTRAINT "ProductReview_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
;

ALTER TABLE "ProductReview"
	ADD CONSTRAINT "ProductReview_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "MarketplaceEvent"
	ADD CONSTRAINT "MarketplaceEvent_sourceProductId_fk"
	FOREIGN KEY ("sourceProductId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "MarketplaceEvent"
	ADD CONSTRAINT "MarketplaceEvent_targetProductId_fk"
	FOREIGN KEY ("targetProductId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "MarketplaceEvent"
	ADD CONSTRAINT "MarketplaceEvent_geoPlaceId_fk"
	FOREIGN KEY ("geoPlaceId")
	REFERENCES "GeoPlace" ("id")
;

ALTER TABLE "MarketplaceEvent"
	ADD CONSTRAINT "MarketplaceEvent_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
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

ALTER TABLE "PolicyAssignment"
	ADD CONSTRAINT "PolicyAssignment_productTargetId_fk"
	FOREIGN KEY ("productTargetId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "PolicyAssignment"
	ADD CONSTRAINT "PolicyAssignment_variantTargetId_fk"
	FOREIGN KEY ("variantTargetId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "PolicyAssignment"
	ADD CONSTRAINT "PolicyAssignment_ratePlanTargetId_fk"
	FOREIGN KEY ("ratePlanTargetId")
	REFERENCES "RatePlan" ("id")
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
	ADD CONSTRAINT "PolicyExceptionRule_productTargetId_fk"
	FOREIGN KEY ("productTargetId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "PolicyExceptionRule"
	ADD CONSTRAINT "PolicyExceptionRule_variantTargetId_fk"
	FOREIGN KEY ("variantTargetId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "PolicyExceptionRule"
	ADD CONSTRAINT "PolicyExceptionRule_ratePlanTargetId_fk"
	FOREIGN KEY ("ratePlanTargetId")
	REFERENCES "RatePlan" ("id")
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

ALTER TABLE "CompliancePolicyVersion"
	ADD CONSTRAINT "CompliancePolicyVersion_policySetId_fk"
	FOREIGN KEY ("policySetId")
	REFERENCES "CompliancePolicySet" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CompliancePolicyVersion"
	ADD CONSTRAINT "CompliancePolicyVersion_approvedBy_fk"
	FOREIGN KEY ("approvedBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "ComplianceRequirementRule"
	ADD CONSTRAINT "ComplianceRequirementRule_policyVersionId_fk"
	FOREIGN KEY ("policyVersionId")
	REFERENCES "CompliancePolicyVersion" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "ComplianceDecisionReason"
	ADD CONSTRAINT "ComplianceDecisionReason_policyVersionId_fk"
	FOREIGN KEY ("policyVersionId")
	REFERENCES "CompliancePolicyVersion" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "ComplianceCase"
	ADD CONSTRAINT "ComplianceCase_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ComplianceCase"
	ADD CONSTRAINT "ComplianceCase_createdBy_fk"
	FOREIGN KEY ("createdBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "CaseTask"
	ADD CONSTRAINT "CaseTask_caseId_fk"
	FOREIGN KEY ("caseId")
	REFERENCES "ComplianceCase" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CaseAssignmentEvent"
	ADD CONSTRAINT "CaseAssignmentEvent_caseId_fk"
	FOREIGN KEY ("caseId")
	REFERENCES "ComplianceCase" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CaseAssignmentEvent"
	ADD CONSTRAINT "CaseAssignmentEvent_taskId_fk"
	FOREIGN KEY ("taskId")
	REFERENCES "CaseTask" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CaseAssignmentEvent"
	ADD CONSTRAINT "CaseAssignmentEvent_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "CaseSlaTimer"
	ADD CONSTRAINT "CaseSlaTimer_caseId_fk"
	FOREIGN KEY ("caseId")
	REFERENCES "ComplianceCase" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CaseLink"
	ADD CONSTRAINT "CaseLink_fromCaseId_fk"
	FOREIGN KEY ("fromCaseId")
	REFERENCES "ComplianceCase" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CaseLink"
	ADD CONSTRAINT "CaseLink_toCaseId_fk"
	FOREIGN KEY ("toCaseId")
	REFERENCES "ComplianceCase" ("id")
	ON DELETE RESTRICT
;

ALTER TABLE "CaseLink"
	ADD CONSTRAINT "CaseLink_createdBy_fk"
	FOREIGN KEY ("createdBy")
	REFERENCES "User" ("id")
;

ALTER TABLE "VariantInventoryConfig"
	ADD CONSTRAINT "VariantInventoryConfig_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "InventoryResource"
	ADD CONSTRAINT "InventoryResource_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "InventoryResource"
	ADD CONSTRAINT "InventoryResource_variantId_fk"
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

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "RatePlanConditionState"
	ADD CONSTRAINT "RatePlanConditionState_variantId_fk"
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

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_productTargetId_fk"
	FOREIGN KEY ("productTargetId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_variantTargetId_fk"
	FOREIGN KEY ("variantTargetId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "CommercialRuleApplication"
	ADD CONSTRAINT "CommercialRuleApplication_ratePlanTargetId_fk"
	FOREIGN KEY ("ratePlanTargetId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "PricingBulkOperationJob"
	ADD CONSTRAINT "PricingBulkOperationJob_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "PricingBulkOperationJob"
	ADD CONSTRAINT "PricingBulkOperationJob_requestedByUserId_fk"
	FOREIGN KEY ("requestedByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "PricingBulkOperationItem"
	ADD CONSTRAINT "PricingBulkOperationItem_jobId_fk"
	FOREIGN KEY ("jobId")
	REFERENCES "PricingBulkOperationJob" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "PricingBulkOperationItem"
	ADD CONSTRAINT "PricingBulkOperationItem_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "PricingBulkOperationItem"
	ADD CONSTRAINT "PricingBulkOperationItem_ruleId_fk"
	FOREIGN KEY ("ruleId")
	REFERENCES "CommercialRule" ("id")
	ON DELETE SET NULL
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

ALTER TABLE "EffectivePricing"
	ADD CONSTRAINT "EffectivePricing_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "EffectivePricing"
	ADD CONSTRAINT "EffectivePricing_ratePlanId_fk"
	FOREIGN KEY ("ratePlanId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "TaxFeeDefinition"
	ADD CONSTRAINT "TaxFeeDefinition_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TaxFeeDefinitionVersion"
	ADD CONSTRAINT "TaxFeeDefinitionVersion_taxFeeDefinitionId_fk"
	FOREIGN KEY ("taxFeeDefinitionId")
	REFERENCES "TaxFeeDefinition" ("id")
;

ALTER TABLE "TaxFeeDefinitionVersion"
	ADD CONSTRAINT "TaxFeeDefinitionVersion_createdByUserId_fk"
	FOREIGN KEY ("createdByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "TaxFeeDefinitionDraft"
	ADD CONSTRAINT "TaxFeeDefinitionDraft_definitionId_fk"
	FOREIGN KEY ("definitionId")
	REFERENCES "TaxFeeDefinition" ("id")
;

ALTER TABLE "TaxFeeDefinitionDraft"
	ADD CONSTRAINT "TaxFeeDefinitionDraft_baseVersionId_fk"
	FOREIGN KEY ("baseVersionId")
	REFERENCES "TaxFeeDefinitionVersion" ("id")
;

ALTER TABLE "TaxFeeDefinitionDraft"
	ADD CONSTRAINT "TaxFeeDefinitionDraft_updatedByUserId_fk"
	FOREIGN KEY ("updatedByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "TaxFeeAssignment"
	ADD CONSTRAINT "TaxFeeAssignment_taxFeeDefinitionId_fk"
	FOREIGN KEY ("taxFeeDefinitionId")
	REFERENCES "TaxFeeDefinition" ("id")
;

ALTER TABLE "TaxFeeAssignment"
	ADD CONSTRAINT "TaxFeeAssignment_providerTargetId_fk"
	FOREIGN KEY ("providerTargetId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "TaxFeeAssignment"
	ADD CONSTRAINT "TaxFeeAssignment_productTargetId_fk"
	FOREIGN KEY ("productTargetId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "TaxFeeAssignment"
	ADD CONSTRAINT "TaxFeeAssignment_variantTargetId_fk"
	FOREIGN KEY ("variantTargetId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "TaxFeeAssignment"
	ADD CONSTRAINT "TaxFeeAssignment_ratePlanTargetId_fk"
	FOREIGN KEY ("ratePlanTargetId")
	REFERENCES "RatePlan" ("id")
;

ALTER TABLE "FiscalActivityEvent"
	ADD CONSTRAINT "FiscalActivityEvent_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FiscalActivityEvent"
	ADD CONSTRAINT "FiscalActivityEvent_definitionId_fk"
	FOREIGN KEY ("definitionId")
	REFERENCES "TaxFeeDefinition" ("id")
;

ALTER TABLE "FiscalActivityEvent"
	ADD CONSTRAINT "FiscalActivityEvent_definitionVersionId_fk"
	FOREIGN KEY ("definitionVersionId")
	REFERENCES "TaxFeeDefinitionVersion" ("id")
;

ALTER TABLE "FiscalActivityEvent"
	ADD CONSTRAINT "FiscalActivityEvent_productId_fk"
	FOREIGN KEY ("productId")
	REFERENCES "Product" ("id")
;

ALTER TABLE "FiscalActivityEvent"
	ADD CONSTRAINT "FiscalActivityEvent_syncRunId_fk"
	FOREIGN KEY ("syncRunId")
	REFERENCES "ProviderIntegrationSyncRun" ("id")
;

ALTER TABLE "FiscalActivityEvent"
	ADD CONSTRAINT "FiscalActivityEvent_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "FiscalExportJob"
	ADD CONSTRAINT "FiscalExportJob_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FiscalExportJob"
	ADD CONSTRAINT "FiscalExportJob_requestedByUserId_fk"
	FOREIGN KEY ("requestedByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "FiscalReconciliationCase"
	ADD CONSTRAINT "FiscalReconciliationCase_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FiscalReconciliationCase"
	ADD CONSTRAINT "FiscalReconciliationCase_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "FiscalReconciliationCase"
	ADD CONSTRAINT "FiscalReconciliationCase_assigneeUserId_fk"
	FOREIGN KEY ("assigneeUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "FiscalReconciliationCase"
	ADD CONSTRAINT "FiscalReconciliationCase_resolvedByUserId_fk"
	FOREIGN KEY ("resolvedByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "FiscalChannelPublication"
	ADD CONSTRAINT "FiscalChannelPublication_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FiscalChannelPublication"
	ADD CONSTRAINT "FiscalChannelPublication_definitionId_fk"
	FOREIGN KEY ("definitionId")
	REFERENCES "TaxFeeDefinition" ("id")
;

ALTER TABLE "FiscalChannelPublication"
	ADD CONSTRAINT "FiscalChannelPublication_definitionVersionId_fk"
	FOREIGN KEY ("definitionVersionId")
	REFERENCES "TaxFeeDefinitionVersion" ("id")
;

ALTER TABLE "FiscalChannelPublication"
	ADD CONSTRAINT "FiscalChannelPublication_connectionId_fk"
	FOREIGN KEY ("connectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
;

ALTER TABLE "FiscalChannelPublication"
	ADD CONSTRAINT "FiscalChannelPublication_syncRunId_fk"
	FOREIGN KEY ("syncRunId")
	REFERENCES "ProviderIntegrationSyncRun" ("id")
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

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_integrationConnectionId_fk"
	FOREIGN KEY ("integrationConnectionId")
	REFERENCES "ProviderIntegrationConnection" ("id")
	ON DELETE SET NULL
;

ALTER TABLE "BookingVoucher"
	ADD CONSTRAINT "BookingVoucher_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "BookingLineItem"
	ADD CONSTRAINT "BookingLineItem_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "BookingLineItem"
	ADD CONSTRAINT "BookingLineItem_variantId_fk"
	FOREIGN KEY ("variantId")
	REFERENCES "Variant" ("id")
;

ALTER TABLE "BookingLineItem"
	ADD CONSTRAINT "BookingLineItem_ratePlanId_fk"
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

ALTER TABLE "FinancialExceptionRecord"
	ADD CONSTRAINT "FinancialExceptionRecord_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "FinancialExceptionRecord"
	ADD CONSTRAINT "FinancialExceptionRecord_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FinancialReference"
	ADD CONSTRAINT "FinancialReference_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "FinancialReference"
	ADD CONSTRAINT "FinancialReference_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "RefundHandoffRecord"
	ADD CONSTRAINT "RefundHandoffRecord_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "RefundHandoffRecord"
	ADD CONSTRAINT "RefundHandoffRecord_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "RefundQuote"
	ADD CONSTRAINT "RefundQuote_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "RefundQuote"
	ADD CONSTRAINT "RefundQuote_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "RefundLedger"
	ADD CONSTRAINT "RefundLedger_refundQuoteId_fk"
	FOREIGN KEY ("refundQuoteId")
	REFERENCES "RefundQuote" ("id")
;

ALTER TABLE "RefundLedger"
	ADD CONSTRAINT "RefundLedger_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "RefundLedger"
	ADD CONSTRAINT "RefundLedger_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "RefundLedger"
	ADD CONSTRAINT "RefundLedger_paymentTransactionId_fk"
	FOREIGN KEY ("paymentTransactionId")
	REFERENCES "PaymentTransaction" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_financialExceptionId_fk"
	FOREIGN KEY ("financialExceptionId")
	REFERENCES "FinancialExceptionRecord" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_financialReferenceId_fk"
	FOREIGN KEY ("financialReferenceId")
	REFERENCES "FinancialReference" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_refundHandoffId_fk"
	FOREIGN KEY ("refundHandoffId")
	REFERENCES "RefundHandoffRecord" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_reconciliationMatchId_fk"
	FOREIGN KEY ("reconciliationMatchId")
	REFERENCES "ReconciliationMatch" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_paymentTransactionId_fk"
	FOREIGN KEY ("paymentTransactionId")
	REFERENCES "PaymentTransaction" ("id")
;

ALTER TABLE "FinancialReviewEvent"
	ADD CONSTRAINT "FinancialReviewEvent_settlementRecordId_fk"
	FOREIGN KEY ("settlementRecordId")
	REFERENCES "FinancialSettlementRecord" ("id")
;

ALTER TABLE "PaymentTransaction"
	ADD CONSTRAINT "PaymentTransaction_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "PaymentTransaction"
	ADD CONSTRAINT "PaymentTransaction_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FinancialSettlementRecord"
	ADD CONSTRAINT "FinancialSettlementRecord_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "FinancialSettlementRecord"
	ADD CONSTRAINT "FinancialSettlementRecord_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "ReconciliationMatch"
	ADD CONSTRAINT "ReconciliationMatch_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "ReconciliationMatch"
	ADD CONSTRAINT "ReconciliationMatch_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "FinancialProviderSummary"
	ADD CONSTRAINT "FinancialProviderSummary_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "CommissionSnapshot"
	ADD CONSTRAINT "CommissionSnapshot_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "CommissionSnapshot"
	ADD CONSTRAINT "CommissionSnapshot_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "PayoutRecord"
	ADD CONSTRAINT "PayoutRecord_bookingId_fk"
	FOREIGN KEY ("bookingId")
	REFERENCES "Booking" ("id")
;

ALTER TABLE "PayoutRecord"
	ADD CONSTRAINT "PayoutRecord_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "InternalRolePermission"
	ADD CONSTRAINT "InternalRolePermission_roleId_fk"
	FOREIGN KEY ("roleId")
	REFERENCES "InternalRole" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "InternalRolePermission"
	ADD CONSTRAINT "InternalRolePermission_permissionKey_fk"
	FOREIGN KEY ("permissionKey")
	REFERENCES "InternalPermission" ("key")
	ON DELETE CASCADE
;

ALTER TABLE "InternalUserRole"
	ADD CONSTRAINT "InternalUserRole_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "InternalUserRole"
	ADD CONSTRAINT "InternalUserRole_roleId_fk"
	FOREIGN KEY ("roleId")
	REFERENCES "InternalRole" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "InternalUserRole"
	ADD CONSTRAINT "InternalUserRole_grantedByUserId_fk"
	FOREIGN KEY ("grantedByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "InternalUserRole"
	ADD CONSTRAINT "InternalUserRole_revokedByUserId_fk"
	FOREIGN KEY ("revokedByUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "InternalSecuritySession"
	ADD CONSTRAINT "InternalSecuritySession_userId_fk"
	FOREIGN KEY ("userId")
	REFERENCES "User" ("id")
	ON DELETE CASCADE
;

ALTER TABLE "AuditEvent"
	ADD CONSTRAINT "AuditEvent_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "AuditEvent"
	ADD CONSTRAINT "AuditEvent_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "SensitiveDataAccessEvent"
	ADD CONSTRAINT "SensitiveDataAccessEvent_auditEventId_fk"
	FOREIGN KEY ("auditEventId")
	REFERENCES "AuditEvent" ("id")
;

ALTER TABLE "SensitiveDataAccessEvent"
	ADD CONSTRAINT "SensitiveDataAccessEvent_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;

ALTER TABLE "SensitiveDataAccessEvent"
	ADD CONSTRAINT "SensitiveDataAccessEvent_providerId_fk"
	FOREIGN KEY ("providerId")
	REFERENCES "Provider" ("id")
;

ALTER TABLE "CommandIdempotency"
	ADD CONSTRAINT "CommandIdempotency_actorUserId_fk"
	FOREIGN KEY ("actorUserId")
	REFERENCES "User" ("id")
;



ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_country_parent_type_normalized_unique" UNIQUE NULLS NOT DISTINCT ("countryCode", "parentId", "placeType", "normalizedName");

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_parent_slug_unique" UNIQUE NULLS NOT DISTINCT ("parentId", "slug");



CREATE INDEX "Provider_dataClassification_idx" ON "Provider" ("dataClassification");

CREATE INDEX "ProviderDocument_providerId_type_idx" ON "ProviderDocument" ("providerId", "type");

CREATE INDEX "ProviderDocument_providerId_status_idx" ON "ProviderDocument" ("providerId", "status");

CREATE INDEX "ProviderTaxConfiguration_status_idx" ON "ProviderTaxConfiguration" ("status");

CREATE INDEX "ProviderTaxConfiguration_taxResidenceCountry_idx" ON "ProviderTaxConfiguration" ("taxResidenceCountry");

CREATE INDEX "ProviderPaymentAccount_providerId_status_idx" ON "ProviderPaymentAccount" ("providerId", "status");

CREATE INDEX "ProviderPaymentAccount_providerId_provider_idx" ON "ProviderPaymentAccount" ("providerId", "provider");

CREATE INDEX "ProviderPaymentAccount_country_idx" ON "ProviderPaymentAccount" ("country");

CREATE INDEX "ProviderIntegrationConnection_provider_connector_idx" ON "ProviderIntegrationConnection" ("providerId", "connectorKey");

CREATE INDEX "ProviderIntegrationConnection_providerId_status_idx" ON "ProviderIntegrationConnection" ("providerId", "status");

CREATE INDEX "ProviderIntegrationConnection_provider_connector_primary_idx" ON "ProviderIntegrationConnection" ("providerId", "connectorKey", "isPrimary");

CREATE INDEX "ProviderIntegrationConnection_due_sync_idx" ON "ProviderIntegrationConnection" ("syncEnabled", "status", "nextSyncAt") WHERE "syncEnabled" = true AND "status" <> 'revoked';

CREATE UNIQUE INDEX "ProviderIntegrationConnection_one_primary_unique" ON "ProviderIntegrationConnection" ("providerId", "connectorKey") WHERE "isPrimary" = true;

CREATE INDEX "ProviderIntegrationCredential_provider_idx" ON "ProviderIntegrationCredential" ("providerId");

CREATE INDEX "ProviderIntegrationCredential_expiry_idx" ON "ProviderIntegrationCredential" ("providerId", "tokenExpiresAt");

CREATE UNIQUE INDEX "ProviderIntegrationMapping_connection_local_unique" ON "ProviderIntegrationMapping" ("connectionId", "mappingType", "localEntityId");

CREATE UNIQUE INDEX "ProviderIntegrationMapping_connection_external_unique" ON "ProviderIntegrationMapping" ("connectionId", "mappingType", "externalEntityId");

CREATE INDEX "ProviderIntegrationMapping_provider_status_idx" ON "ProviderIntegrationMapping" ("providerId", "status");

CREATE INDEX "ProviderIntegrationCertification_provider_status_idx" ON "ProviderIntegrationCertification" ("providerId", "status");

CREATE INDEX "ProviderIntegrationCertification_connection_status_idx" ON "ProviderIntegrationCertification" ("connectionId", "status");

CREATE INDEX "ProviderIntegrationCertification_fixture_product_idx" ON "ProviderIntegrationCertification" ("fixtureProductId");

CREATE UNIQUE INDEX "ProviderIntegrationCertification_one_active_connection_unique" ON "ProviderIntegrationCertification" ("connectionId") WHERE "status" IN ('draft', 'prepared', 'ready', 'running', 'requires_attention');

CREATE UNIQUE INDEX "ProviderIntegrationSyncRun_connection_idempotency_unique" ON "ProviderIntegrationSyncRun" ("connectionId", "idempotencyKey");

CREATE INDEX "ProviderIntegrationSyncRun_connection_started_idx" ON "ProviderIntegrationSyncRun" ("connectionId", "startedAt");

CREATE INDEX "ProviderIntegrationSyncRun_provider_status_started_idx" ON "ProviderIntegrationSyncRun" ("providerId", "status", "startedAt");

CREATE INDEX "ProviderIntegrationSyncRun_certification_started_idx" ON "ProviderIntegrationSyncRun" ("certificationId", "startedAt");

CREATE INDEX "ProviderIntegrationSyncRun_terminal_retention_idx" ON "ProviderIntegrationSyncRun" ("status", "finishedAt") WHERE "status" <> 'running' AND "finishedAt" IS NOT NULL;

CREATE UNIQUE INDEX "ProviderIntegrationSyncJob_target_idempotency_unique" ON "ProviderIntegrationSyncJob" ("targetType", "targetId", "idempotencyKey");

CREATE INDEX "ProviderIntegrationSyncJob_claim_due_idx" ON "ProviderIntegrationSyncJob" ("targetType", "priority", "runAfter", "createdAt", "providerId") WHERE "status" = 'queued';

CREATE INDEX "ProviderIntegrationSyncJob_provider_status_idx" ON "ProviderIntegrationSyncJob" ("providerId", "status", "runAfter");

CREATE INDEX "ProviderIntegrationSyncJob_terminal_retention_idx" ON "ProviderIntegrationSyncJob" ("status", "finishedAt") WHERE "status" IN ('succeeded', 'failed') AND "finishedAt" IS NOT NULL;

CREATE UNIQUE INDEX "ProviderIntegrationIncident_connection_dedupe_unique" ON "ProviderIntegrationIncident" ("connectionId", "dedupeKey");

CREATE INDEX "ProviderIntegrationIncident_provider_status_severity_idx" ON "ProviderIntegrationIncident" ("providerId", "status", "severity");

CREATE INDEX "ProviderIntegrationIncident_connection_last_seen_idx" ON "ProviderIntegrationIncident" ("connectionId", "lastSeenAt");

CREATE INDEX "ProviderIntegrationIncident_open_last_seen_idx" ON "ProviderIntegrationIncident" ("lastSeenAt") WHERE "status" = 'open';

CREATE INDEX "ProviderExternalCalendar_provider_status_idx" ON "ProviderExternalCalendar" ("providerId", "status");

CREATE INDEX "ProviderExternalCalendar_variant_status_idx" ON "ProviderExternalCalendar" ("variantId", "status");

CREATE INDEX "ProviderExternalCalendar_resource_status_idx" ON "ProviderExternalCalendar" ("resourceId", "status");

CREATE INDEX "ProviderExternalCalendar_due_sync_idx" ON "ProviderExternalCalendar" ("nextSyncAt", "id") WHERE "syncEnabled" = true AND "status" <> 'revoked';

CREATE UNIQUE INDEX "ProviderExternalCalendar_provider_variant_fingerprint_unique" ON "ProviderExternalCalendar" ("providerId", "variantId", "feedUrlFingerprint");

CREATE UNIQUE INDEX "ProviderExternalCalendarEvent_calendar_source_unique" ON "ProviderExternalCalendarEvent" ("calendarId", "sourceKey");

CREATE INDEX "ProviderExternalCalendarEvent_variant_active_range_idx" ON "ProviderExternalCalendarEvent" ("variantId", "startDate", "endDate") WHERE "isActive" = true;

CREATE INDEX "ProviderExternalCalendarEvent_resource_active_range_idx" ON "ProviderExternalCalendarEvent" ("resourceId", "startDate", "endDate") WHERE "isActive" = true AND "resourceId" IS NOT NULL;

CREATE INDEX "ProviderExternalCalendarEvent_calendar_active_idx" ON "ProviderExternalCalendarEvent" ("calendarId", "isActive");

CREATE INDEX "ProviderExternalCalendarEvent_inactive_retention_idx" ON "ProviderExternalCalendarEvent" ("lastSeenAt") WHERE "isActive" = false;

CREATE INDEX "ProviderExternalCalendarEvent_ended_retention_idx" ON "ProviderExternalCalendarEvent" ("endDate");

CREATE UNIQUE INDEX "ProviderExternalCalendarConflict_calendar_dedupe_unique" ON "ProviderExternalCalendarConflict" ("calendarId", "dedupeKey");

CREATE INDEX "ProviderExternalCalendarConflict_provider_status_idx" ON "ProviderExternalCalendarConflict" ("providerId", "status", "lastSeenAt");

CREATE INDEX "ProviderExternalCalendarConflict_calendar_status_idx" ON "ProviderExternalCalendarConflict" ("calendarId", "status");

CREATE INDEX "ProviderExternalCalendarExport_provider_status_idx" ON "ProviderExternalCalendarExport" ("providerId", "status");

CREATE INDEX "ProviderExternalCalendarExport_variant_status_idx" ON "ProviderExternalCalendarExport" ("variantId", "status");

CREATE UNIQUE INDEX "ProviderExternalCalendarExport_token_unique" ON "ProviderExternalCalendarExport" ("tokenHash");

CREATE INDEX "ProviderAuditLog_provider_created_idx" ON "ProviderAuditLog" ("providerId", "createdAt");

CREATE INDEX "ProviderAuditLog_provider_entity_type_idx" ON "ProviderAuditLog" ("providerId", "entityType");

CREATE INDEX "ProviderComplianceAssignment_provider_domain_status_idx" ON "ProviderComplianceAssignment" ("providerId", "domain", "status");

CREATE INDEX "ProviderComplianceAssignment_slaDueAt_idx" ON "ProviderComplianceAssignment" ("slaDueAt");

CREATE INDEX "ProviderComplianceAssignment_provider_entity_idx" ON "ProviderComplianceAssignment" ("providerId", "entityId");

CREATE UNIQUE INDEX "ProviderComplianceAssignment_open_unique" ON "ProviderComplianceAssignment" ("providerId", "domain", "entityId") WHERE "status" = 'open';

CREATE INDEX "ProviderConfigurationState_canPublish_idx" ON "ProviderConfigurationState" ("canPublish");

CREATE INDEX "ProviderConfigurationState_canAcceptBookings_idx" ON "ProviderConfigurationState" ("canAcceptBookings");

CREATE INDEX "ProviderConfigurationState_canCollectPayments_idx" ON "ProviderConfigurationState" ("canCollectPayments");

CREATE INDEX "ProviderVerification_providerId_status_idx" ON "ProviderVerification" ("providerId", "status");

CREATE INDEX "ProviderVerification_providerId_created_idx" ON "ProviderVerification" ("providerId", "createdAt", "id");

CREATE UNIQUE INDEX "ProviderUser_providerId_userId_unique" ON "ProviderUser" ("providerId", "userId");

CREATE INDEX "ProviderInvitation_providerId_status_idx" ON "ProviderInvitation" ("providerId", "status");

CREATE INDEX "ProviderInvitation_providerId_email_idx" ON "ProviderInvitation" ("providerId", "email");

CREATE UNIQUE INDEX "ProviderInvitation_token_unique" ON "ProviderInvitation" ("token");

CREATE INDEX "ProviderInvitation_providerId_created_idx" ON "ProviderInvitation" ("providerId", "createdAt", "id");

CREATE UNIQUE INDEX "User_email_unique" ON "User" ("email");

CREATE UNIQUE INDEX "User_username_unique" ON "User" ("username");

CREATE INDEX "ProviderFinancialProfile_status_idx" ON "ProviderFinancialProfile" ("status");

CREATE INDEX "ProviderFinancialProfile_taxProfileStatus_idx" ON "ProviderFinancialProfile" ("taxProfileStatus");

CREATE INDEX "ProviderPayableSnapshot_booking_provider_idx" ON "ProviderPayableSnapshot" ("bookingId", "providerId");

CREATE INDEX "ProviderPayableSnapshot_provider_snapshot_idx" ON "ProviderPayableSnapshot" ("providerId", "snapshotAt");

CREATE INDEX "ProviderStatement_provider_status_idx" ON "ProviderStatement" ("providerId", "status");

CREATE INDEX "ProviderStatement_statementReference_idx" ON "ProviderStatement" ("statementReference");

CREATE UNIQUE INDEX "GeoPlace_canonicalPath_unique" ON "GeoPlace" ("canonicalPath");

CREATE INDEX "GeoPlace_parent_type_status_idx" ON "GeoPlace" ("parentId", "placeType", "status");

CREATE INDEX "GeoPlace_country_type_status_idx" ON "GeoPlace" ("countryCode", "placeType", "status");

CREATE INDEX "GeoPlace_mergedIntoId_idx" ON "GeoPlace" ("mergedIntoId");

CREATE INDEX "GeoPlaceClosure_descendant_depth_idx" ON "GeoPlaceClosure" ("descendantId", "depth");

CREATE UNIQUE INDEX "GeoPlaceAlias_place_locale_normalized_unique" ON "GeoPlaceAlias" ("placeId", "locale", "normalizedAlias");

CREATE INDEX "GeoPlaceAlias_normalized_locale_idx" ON "GeoPlaceAlias" ("normalizedAlias", "locale");

CREATE UNIQUE INDEX "GeoPlaceContent_place_locale_unique" ON "GeoPlaceContent" ("placeId", "locale");

CREATE INDEX "GeoPlaceContent_status_rank_idx" ON "GeoPlaceContent" ("publicationStatus", "featuredRank");

CREATE UNIQUE INDEX "GeoPlaceExternalId_source_external_unique" ON "GeoPlaceExternalId" ("source", "externalId");

CREATE UNIQUE INDEX "GeoPlaceExternalId_place_source_external_unique" ON "GeoPlaceExternalId" ("placeId", "source", "externalId");

CREATE INDEX "GeoPlaceExternalId_place_source_idx" ON "GeoPlaceExternalId" ("placeId", "source");

CREATE INDEX "ImageUpload_objectKey_status_idx" ON "ImageUpload" ("objectKey", "status");

CREATE UNIQUE INDEX "ProductImage_imageId_unique" ON "ProductImage" ("imageId");

CREATE UNIQUE INDEX "ProductImage_one_primary_product_unique" ON "ProductImage" ("productId") WHERE "isPrimary" = true;

CREATE INDEX "ProductImage_product_sort_idx" ON "ProductImage" ("productId", "sortOrder", "imageId");

CREATE UNIQUE INDEX "VariantImage_imageId_unique" ON "VariantImage" ("imageId");

CREATE UNIQUE INDEX "VariantImage_one_primary_variant_unique" ON "VariantImage" ("variantId") WHERE "isPrimary" = true;

CREATE INDEX "VariantImage_variant_sort_idx" ON "VariantImage" ("variantId", "sortOrder", "imageId");

CREATE INDEX "Product_providerId_productType_idx" ON "Product" ("providerId", "productType");

CREATE INDEX "Product_providerId_idx" ON "Product" ("providerId");

CREATE INDEX "Product_provider_publication_idx" ON "Product" ("providerId", "publicationState");

CREATE INDEX "Product_publication_discovery_idx" ON "Product" ("publicationState", "dataClass");

CREATE UNIQUE INDEX "ProductGeoPlace_product_place_role_unique" ON "ProductGeoPlace" ("productId", "placeId", "role");

CREATE UNIQUE INDEX "ProductGeoPlace_one_primary_product_unique" ON "ProductGeoPlace" ("productId") WHERE "isPrimary" = true;

CREATE INDEX "ProductGeoPlace_place_role_product_idx" ON "ProductGeoPlace" ("placeId", "role", "productId");

CREATE INDEX "ProductGeoPlace_product_role_idx" ON "ProductGeoPlace" ("productId", "role");

CREATE INDEX "ProductGeoPlaceActivity_product_created_idx" ON "ProductGeoPlaceActivity" ("productId", "createdAt");

CREATE UNIQUE INDEX "MarketplaceCommercialCertificationRun_suite_started_unique" ON "MarketplaceCommercialCertificationRun" ("suiteVersion", "startedAt");

CREATE INDEX "MarketplaceCommercialCertificationRun_status_started_idx" ON "MarketplaceCommercialCertificationRun" ("status", "startedAt");

CREATE INDEX "ProductOperationalSurface_provider_updated_idx" ON "ProductOperationalSurface" ("providerId", "updatedAt");

CREATE INDEX "ProductOperationalSurface_provider_status_idx" ON "ProductOperationalSurface" ("providerId", "status");

CREATE INDEX "ProductOperationalSurface_provider_ready_idx" ON "ProductOperationalSurface" ("providerId", "readyToPublish");

CREATE INDEX "HouseRule_productId_scope_idx" ON "HouseRule" ("productId", "scope");

CREATE UNIQUE INDEX "HouseRule_product_type_unique" ON "HouseRule" ("productId", "type") WHERE "scope" = 'product';

CREATE UNIQUE INDEX "HouseRule_variant_type_unique" ON "HouseRule" ("scopeId", "type") WHERE "scope" = 'variant';

CREATE INDEX "Tour_durationMinutes_idx" ON "Tour" ("durationMinutes");

CREATE INDEX "Tour_difficultyLevel_idx" ON "Tour" ("difficultyLevel");

CREATE INDEX "TourSlotProfile_departureTime_idx" ON "TourSlotProfile" ("departureTime");

CREATE INDEX "TourSlotProfile_languageCode_idx" ON "TourSlotProfile" ("languageCode");

CREATE INDEX "TourSlotProfile_bookingMode_idx" ON "TourSlotProfile" ("bookingMode");

CREATE UNIQUE INDEX "TourDepartureInstance_variant_date_unique" ON "TourDepartureInstance" ("variantId", "date");

CREATE INDEX "TourDepartureInstance_provider_date_idx" ON "TourDepartureInstance" ("providerId", "date");

CREATE INDEX "TourOperationalResource_provider_type_status_idx" ON "TourOperationalResource" ("providerId", "type", "status");

CREATE UNIQUE INDEX "TourResourceAssignment_variant_date_role_unique" ON "TourResourceAssignment" ("variantId", "date", "role");

CREATE UNIQUE INDEX "TourResourceAssignment_resource_date_unique" ON "TourResourceAssignment" ("resourceId", "date");

CREATE UNIQUE INDEX "TourTicketType_product_code_unique" ON "TourTicketType" ("productId", "code");

CREATE INDEX "TourTicketType_productId_idx" ON "TourTicketType" ("productId");

CREATE INDEX "TourBookingQuestion_product_sort_idx" ON "TourBookingQuestion" ("productId", "sortOrder");

CREATE INDEX "TourPrivateRequest_provider_status_idx" ON "TourPrivateRequest" ("providerId", "status", "createdAt");

CREATE INDEX "TourPrivateRequest_product_idx" ON "TourPrivateRequest" ("productId", "departureDate");

CREATE INDEX "Variant_product_sales_lifecycle_idx" ON "Variant" ("productId", "salesEnabled", "lifecycleState");

CREATE INDEX "Variant_productId_kind_idx" ON "Variant" ("productId", "kind");

CREATE INDEX "VariantRoomProfile_roomTypeId_idx" ON "VariantRoomProfile" ("roomTypeId");

CREATE INDEX "VariantRoomBed_variantId_idx" ON "VariantRoomBed" ("variantId");

CREATE UNIQUE INDEX "VariantRoomAmenity_variantId_amenityId_unique" ON "VariantRoomAmenity" ("variantId", "amenityId");

CREATE UNIQUE INDEX "ProductService_productId_serviceId_unique" ON "ProductService" ("productId", "serviceId");

CREATE INDEX "ProductServiceAttribute_productServiceId_key_idx" ON "ProductServiceAttribute" ("productServiceId", "key");

CREATE UNIQUE INDEX "ProductCategory_vertical_slug_unique" ON "ProductCategory" ("vertical", "slug");

CREATE INDEX "ProductCategory_vertical_idx" ON "ProductCategory" ("vertical");

CREATE UNIQUE INDEX "ProductCategoryLink_product_category_unique" ON "ProductCategoryLink" ("productId", "categoryId");

CREATE INDEX "ProductCategoryLink_categoryId_idx" ON "ProductCategoryLink" ("categoryId");

CREATE INDEX "ProductCategoryLink_productId_idx" ON "ProductCategoryLink" ("productId");

CREATE INDEX "ProductReview_product_status_idx" ON "ProductReview" ("productId", "status");

CREATE INDEX "ProductReview_product_rating_idx" ON "ProductReview" ("productId", "rating");

CREATE INDEX "ProductReview_bookingId_idx" ON "ProductReview" ("bookingId");

CREATE UNIQUE INDEX "ProductReview_bookingId_unique" ON "ProductReview" ("bookingId");

CREATE INDEX "MarketplaceEvent_surface_created_idx" ON "MarketplaceEvent" ("surface", "createdAt");

CREATE INDEX "MarketplaceEvent_target_created_idx" ON "MarketplaceEvent" ("targetProductId", "createdAt");

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

CREATE INDEX "CancellationTier_hoursBeforeDeparture_idx" ON "CancellationTier" ("hoursBeforeDeparture");

CREATE UNIQUE INDEX "PolicyRule_policyId_ruleKey_unique" ON "PolicyRule" ("policyId", "ruleKey");

CREATE INDEX "PolicyExceptionRule_context_type_active_idx" ON "PolicyExceptionRule" ("scope", "scopeId", "category", "type", "isActive");

CREATE INDEX "PolicyExceptionRule_context_priority_idx" ON "PolicyExceptionRule" ("scope", "scopeId", "isActive", "priority");

CREATE INDEX "PolicyExceptionRule_category_active_idx" ON "PolicyExceptionRule" ("category", "isActive");

CREATE INDEX "PolicyExceptionRule_effective_range_idx" ON "PolicyExceptionRule" ("effectiveFrom", "effectiveTo");

CREATE INDEX "PolicyAuditLog_event_created_idx" ON "PolicyAuditLog" ("eventType", "createdAt");

CREATE INDEX "PolicyAuditLog_policyGroupId_idx" ON "PolicyAuditLog" ("policyGroupId");

CREATE INDEX "PolicyAuditLog_scope_scopeId_idx" ON "PolicyAuditLog" ("scope", "scopeId");

CREATE UNIQUE INDEX "CompliancePolicySet_key_unique" ON "CompliancePolicySet" ("key");

CREATE UNIQUE INDEX "CompliancePolicyVersion_set_version_unique" ON "CompliancePolicyVersion" ("policySetId", "version");

CREATE INDEX "CompliancePolicyVersion_active_idx" ON "CompliancePolicyVersion" ("policySetId", "status", "effectiveFrom");

CREATE UNIQUE INDEX "ComplianceRequirementRule_version_requirement_unique" ON "ComplianceRequirementRule" ("policyVersionId", "requirementKey");

CREATE UNIQUE INDEX "ComplianceDecisionReason_version_code_unique" ON "ComplianceDecisionReason" ("policyVersionId", "code");

CREATE UNIQUE INDEX "ComplianceCase_caseNumber_unique" ON "ComplianceCase" ("caseNumber");

CREATE INDEX "ComplianceCase_status_priority_opened_idx" ON "ComplianceCase" ("status", "priority", "openedAt");

CREATE INDEX "ComplianceCase_provider_status_idx" ON "ComplianceCase" ("providerId", "status");

CREATE INDEX "ComplianceCase_domain_status_priority_idx" ON "ComplianceCase" ("domain", "status", "priority");

CREATE UNIQUE INDEX "ComplianceCase_active_source_unique" ON "ComplianceCase" ("providerId", "domain", "sourceType", "sourceRef") WHERE "status" IN ('open', 'in_review', 'waiting_information', 'blocked');

CREATE UNIQUE INDEX "CaseTask_case_taskKey_unique" ON "CaseTask" ("caseId", "taskKey");

CREATE INDEX "CaseTask_status_due_idx" ON "CaseTask" ("status", "dueAt");

CREATE INDEX "CaseTask_assignee_status_idx" ON "CaseTask" ("assigneeEmail", "status");

CREATE INDEX "CaseAssignmentEvent_case_created_idx" ON "CaseAssignmentEvent" ("caseId", "createdAt");

CREATE UNIQUE INDEX "CaseSlaTimer_case_timer_unique" ON "CaseSlaTimer" ("caseId", "timerKey");

CREATE INDEX "CaseSlaTimer_due_running_idx" ON "CaseSlaTimer" ("dueAt", "status");

CREATE UNIQUE INDEX "CaseLink_unique" ON "CaseLink" ("fromCaseId", "toCaseId", "linkType");

CREATE UNIQUE INDEX "DomainEventOutbox_dedupe_unique" ON "DomainEventOutbox" ("dedupeKey");

CREATE INDEX "DomainEventOutbox_pending_idx" ON "DomainEventOutbox" ("status", "availableAt", "createdAt") WHERE "status" = 'pending';

CREATE INDEX "InventoryResource_provider_variant_status_idx" ON "InventoryResource" ("providerId", "variantId", "status");

CREATE UNIQUE INDEX "InventoryResource_variant_label_unique" ON "InventoryResource" ("variantId", "label");

CREATE UNIQUE INDEX "DailyInventory_variantId_date_unique" ON "DailyInventory" ("variantId", "date");

CREATE UNIQUE INDEX "EffectiveAvailability_variantId_date_unique" ON "EffectiveAvailability" ("variantId", "date");

CREATE INDEX "InventoryLock_variantId_date_idx" ON "InventoryLock" ("variantId", "date");

CREATE INDEX "InventoryLock_holdId_idx" ON "InventoryLock" ("holdId");

CREATE INDEX "Hold_variantId_checkIn_idx" ON "Hold" ("variantId", "checkIn");

CREATE INDEX "Hold_expiresAt_idx" ON "Hold" ("expiresAt");

CREATE INDEX "Hold_priceQuoteId_idx" ON "Hold" ("priceQuoteId");

CREATE UNIQUE INDEX "SearchUnitView_variant_rate_date_occupancy_unique" ON "SearchUnitView" ("variantId", "ratePlanId", "date", "occupancyKey");

CREATE INDEX "SearchUnitView_product_date_occupancy_idx" ON "SearchUnitView" ("productId", "date", "occupancyKey");

CREATE INDEX "SearchUnitView_variant_date_idx" ON "SearchUnitView" ("variantId", "date");

CREATE INDEX "SearchUnitView_blocker_price_idx" ON "SearchUnitView" ("primaryBlocker", "pricePerNight");

CREATE UNIQUE INDEX "SearchMaterializationLog_run_unique" ON "SearchMaterializationLog" ("runId");

CREATE INDEX "SearchMaterializationLog_status_created_idx" ON "SearchMaterializationLog" ("status", "createdAt");

CREATE INDEX "SearchMaterializationLog_started_idx" ON "SearchMaterializationLog" ("startedAt");

CREATE INDEX "SearchMaterializationLog_variant_started_idx" ON "SearchMaterializationLog" ("variantId", "startedAt");

CREATE INDEX "SearchMaterializationLog_product_started_idx" ON "SearchMaterializationLog" ("productId", "startedAt");

CREATE INDEX "RatePlan_variantId_isActive_idx" ON "RatePlan" ("variantId", "isActive");

CREATE INDEX "RatePlan_variantId_isDefault_isActive_idx" ON "RatePlan" ("variantId", "isDefault", "isActive");

CREATE UNIQUE INDEX "RatePlanConditionState_ratePlan_channel_unique" ON "RatePlanConditionState" ("ratePlanId", "channel");

CREATE INDEX "RatePlanConditionState_provider_updated_idx" ON "RatePlanConditionState" ("providerId", "updatedAt");

CREATE INDEX "RatePlanConditionState_product_idx" ON "RatePlanConditionState" ("productId");

CREATE INDEX "RatePlanConditionState_variant_idx" ON "RatePlanConditionState" ("variantId");

CREATE INDEX "RatePlanConditionState_complete_idx" ON "RatePlanConditionState" ("conditionsComplete");

CREATE INDEX "RatePlanOccupancyPolicy_ratePlan_effective_idx" ON "RatePlanOccupancyPolicy" ("ratePlanId", "effectiveFrom", "effectiveTo");

CREATE INDEX "RatePlanOccupancyPolicy_ratePlan_current_idx" ON "RatePlanOccupancyPolicy" ("ratePlanId", "effectiveFrom", "id", "effectiveTo");

CREATE INDEX "CommercialRuleSet_provider_status_idx" ON "CommercialRuleSet" ("providerId", "status");

CREATE INDEX "CommercialRuleSet_provider_date_range_idx" ON "CommercialRuleSet" ("providerId", "dateFrom", "dateTo");

CREATE INDEX "CommercialRule_provider_category_type_idx" ON "CommercialRule" ("providerId", "category", "type");

CREATE INDEX "CommercialRule_ruleSetId_isActive_idx" ON "CommercialRule" ("ruleSetId", "isActive");

CREATE UNIQUE INDEX "CommercialRule_provider_idempotency_unique" ON "CommercialRule" ("providerId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "CommercialRuleApplication_provider_scope_active_idx" ON "CommercialRuleApplication" ("providerId", "scope", "scopeId", "isActive");

CREATE INDEX "CommercialRuleApplication_rule_scope_idx" ON "CommercialRuleApplication" ("ruleId", "scope", "scopeId");

CREATE INDEX "CommercialRuleApplication_ruleSet_active_idx" ON "CommercialRuleApplication" ("ruleSetId", "isActive");

CREATE UNIQUE INDEX "PricingBulkOperationJob_provider_idempotency_unique" ON "PricingBulkOperationJob" ("providerId", "idempotencyKey");

CREATE INDEX "PricingBulkOperationJob_claim_due_idx" ON "PricingBulkOperationJob" ("runAfter", "createdAt", "providerId") WHERE "status" = 'queued';

CREATE INDEX "PricingBulkOperationJob_finalization_due_idx" ON "PricingBulkOperationJob" ("runAfter", "createdAt") WHERE "status" = 'finalizing' AND "lockedBy" IS NULL;

CREATE INDEX "PricingBulkOperationJob_provider_status_idx" ON "PricingBulkOperationJob" ("providerId", "status", "runAfter");

CREATE INDEX "PricingBulkOperationJob_requires_attention_idx" ON "PricingBulkOperationJob" ("providerId", "requiresAttentionAt") WHERE "status" = 'requires_attention';

CREATE INDEX "PricingBulkOperationJob_terminal_retention_idx" ON "PricingBulkOperationJob" ("status", "finishedAt") WHERE "status" IN ('succeeded', 'partial', 'failed', 'cancelled') AND "finishedAt" IS NOT NULL;

CREATE UNIQUE INDEX "PricingBulkOperationItem_job_ratePlan_unique" ON "PricingBulkOperationItem" ("jobId", "ratePlanId");

CREATE INDEX "PricingBulkOperationItem_job_status_idx" ON "PricingBulkOperationItem" ("jobId", "status", "createdAt");

CREATE INDEX "PricingBulkOperationItem_ratePlan_status_idx" ON "PricingBulkOperationItem" ("ratePlanId", "status");

CREATE UNIQUE INDEX "EffectiveRestriction_variant_rate_date_unique" ON "EffectiveRestriction" ("variantId", "ratePlanId", "date");

CREATE INDEX "EffectiveRestriction_variant_date_idx" ON "EffectiveRestriction" ("variantId", "date");

CREATE INDEX "EffectiveRestriction_ratePlan_date_idx" ON "EffectiveRestriction" ("ratePlanId", "date");

CREATE UNIQUE INDEX "EffectivePricing_variant_rate_date_occupancy_unique" ON "EffectivePricing" ("variantId", "ratePlanId", "date", "occupancyKey");

CREATE INDEX "EffectivePricing_ratePlan_date_idx" ON "EffectivePricing" ("ratePlanId", "date");

CREATE INDEX "EffectivePricing_ratePlan_occupancy_date_idx" ON "EffectivePricing" ("ratePlanId", "occupancyKey", "date", "computedAt");

CREATE INDEX "EffectivePricing_variant_date_occupancy_idx" ON "EffectivePricing" ("variantId", "date", "occupancyKey");

CREATE INDEX "TaxFeeDefinition_provider_status_priority_idx" ON "TaxFeeDefinition" ("providerId", "status", "priority");

CREATE INDEX "TaxFeeDefinition_provider_code_status_idx" ON "TaxFeeDefinition" ("providerId", "code", "status");

CREATE UNIQUE INDEX "TaxFeeDefinitionVersion_definition_version_unique" ON "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "version");

CREATE INDEX "TaxFeeDefinitionVersion_definition_created_idx" ON "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "createdAt");

CREATE INDEX "TaxFeeDefinitionDraft_base_version_idx" ON "TaxFeeDefinitionDraft" ("baseVersionId");

CREATE INDEX "TaxFeeAssignment_scope_active_channel_idx" ON "TaxFeeAssignment" ("scope", "scopeId", "status", "channel");

CREATE INDEX "TaxFeeAssignment_definition_scope_active_idx" ON "TaxFeeAssignment" ("taxFeeDefinitionId", "scope", "scopeId", "status", "channel");

CREATE INDEX "TaxFeeAssignment_effective_range_idx" ON "TaxFeeAssignment" ("status", "effectiveFrom", "effectiveTo");

CREATE INDEX "FiscalActivityEvent_provider_created_idx" ON "FiscalActivityEvent" ("providerId", "createdAt");

CREATE INDEX "FiscalActivityEvent_provider_type_created_idx" ON "FiscalActivityEvent" ("providerId", "eventType", "createdAt");

CREATE INDEX "FiscalActivityEvent_correlation_idx" ON "FiscalActivityEvent" ("correlationId");

CREATE INDEX "FiscalExportJob_provider_created_idx" ON "FiscalExportJob" ("providerId", "createdAt");

CREATE INDEX "FiscalReconciliationCase_provider_status_idx" ON "FiscalReconciliationCase" ("providerId", "status");

CREATE UNIQUE INDEX "FiscalReconciliationCase_provider_booking_unique" ON "FiscalReconciliationCase" ("providerId", "bookingId");

CREATE UNIQUE INDEX "FiscalChannelPublication_version_connection_unique" ON "FiscalChannelPublication" ("definitionVersionId", "connectionId");

CREATE INDEX "FiscalChannelPublication_provider_status_idx" ON "FiscalChannelPublication" ("providerId", "status");

CREATE INDEX "BookingTaxFee_bookingId_idx" ON "BookingTaxFee" ("bookingId");

CREATE INDEX "Booking_provider_status_checkin_idx" ON "Booking" ("providerId", "status", "checkInDate");

CREATE INDEX "Booking_provider_operation_checkout_idx" ON "Booking" ("providerId", "operationalStatus", "checkOutDate");

CREATE INDEX "Booking_ratePlanId_idx" ON "Booking" ("ratePlanId");

CREATE UNIQUE INDEX "Booking_connection_external_booking_unique" ON "Booking" ("integrationConnectionId", "externalBookingId") WHERE "integrationConnectionId" IS NOT NULL AND "externalBookingId" IS NOT NULL;

CREATE UNIQUE INDEX "Booking_connection_external_revision_unique" ON "Booking" ("integrationConnectionId", "externalRevisionId") WHERE "integrationConnectionId" IS NOT NULL AND "externalRevisionId" IS NOT NULL;

CREATE INDEX "Booking_provider_source_booking_date_idx" ON "Booking" ("providerId", "source", "bookingDate");

CREATE UNIQUE INDEX "BookingVoucher_bookingId_unique" ON "BookingVoucher" ("bookingId");

CREATE UNIQUE INDEX "BookingVoucher_code_unique" ON "BookingVoucher" ("code");

CREATE INDEX "BookingVoucher_status_idx" ON "BookingVoucher" ("status");

CREATE INDEX "BookingLineItem_bookingId_idx" ON "BookingLineItem" ("bookingId");

CREATE INDEX "BookingLineItem_variantId_idx" ON "BookingLineItem" ("variantId");

CREATE INDEX "BookingLineItem_ratePlanId_idx" ON "BookingLineItem" ("ratePlanId");

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

CREATE INDEX "FinancialReviewEvent_paymentTransactionId_idx" ON "FinancialReviewEvent" ("paymentTransactionId");

CREATE INDEX "FinancialReviewEvent_settlementRecordId_idx" ON "FinancialReviewEvent" ("settlementRecordId");

CREATE UNIQUE INDEX "FinancialReviewEvent_payment_association_unique" ON "FinancialReviewEvent" ("paymentTransactionId") WHERE "type" = 'external_evidence_associated' AND "paymentTransactionId" IS NOT NULL;

CREATE UNIQUE INDEX "FinancialReviewEvent_settlement_association_unique" ON "FinancialReviewEvent" ("settlementRecordId") WHERE "type" = 'external_evidence_associated' AND "settlementRecordId" IS NOT NULL;

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

CREATE INDEX "FinancialProviderSummary_computedAt_idx" ON "FinancialProviderSummary" ("computedAt");

CREATE INDEX "FinancialProviderSummary_invalidatedAt_idx" ON "FinancialProviderSummary" ("invalidatedAt");

CREATE INDEX "CommissionSnapshot_booking_provider_idx" ON "CommissionSnapshot" ("bookingId", "providerId");

CREATE INDEX "CommissionSnapshot_provider_snapshot_idx" ON "CommissionSnapshot" ("providerId", "snapshotAt");

CREATE INDEX "PayoutRecord_bookingId_idx" ON "PayoutRecord" ("bookingId");

CREATE INDEX "PayoutRecord_provider_status_idx" ON "PayoutRecord" ("providerId", "status");

CREATE INDEX "PayoutRecord_payoutReference_idx" ON "PayoutRecord" ("payoutReference");

CREATE UNIQUE INDEX "InternalRole_key_unique" ON "InternalRole" ("key");

CREATE INDEX "InternalUserRole_user_status_idx" ON "InternalUserRole" ("userId", "status");

CREATE INDEX "InternalUserRole_role_status_idx" ON "InternalUserRole" ("roleId", "status");

CREATE UNIQUE INDEX "InternalUserRole_active_unique" ON "InternalUserRole" ("userId", "roleId", "scopeType", "scopeId") WHERE "status" = 'active';

CREATE UNIQUE INDEX "InternalSecuritySession_fingerprint_unique" ON "InternalSecuritySession" ("sessionFingerprint");

CREATE INDEX "InternalSecuritySession_user_expires_idx" ON "InternalSecuritySession" ("userId", "expiresAt");

CREATE INDEX "AuditEvent_request_created_idx" ON "AuditEvent" ("requestId", "createdAt");

CREATE INDEX "AuditEvent_actor_created_idx" ON "AuditEvent" ("actorUserId", "createdAt");

CREATE INDEX "AuditEvent_provider_created_idx" ON "AuditEvent" ("providerId", "createdAt");

CREATE INDEX "AuditEvent_entity_created_idx" ON "AuditEvent" ("entityType", "entityId", "createdAt");

CREATE INDEX "SensitiveDataAccessEvent_actor_created_idx" ON "SensitiveDataAccessEvent" ("actorUserId", "createdAt");

CREATE INDEX "SensitiveDataAccessEvent_resource_created_idx" ON "SensitiveDataAccessEvent" ("resourceType", "resourceId", "createdAt");

CREATE UNIQUE INDEX "CommandIdempotency_scope_key_unique" ON "CommandIdempotency" ("scope", "key");

CREATE INDEX "CommandIdempotency_expires_idx" ON "CommandIdempotency" ("expiresAt");



ALTER TABLE "Provider" ADD CONSTRAINT "Provider_accountPurpose_check" CHECK ("accountPurpose" IN ('commercial', 'internal_qa', 'integration_certification'));

ALTER TABLE "Provider" ADD CONSTRAINT "Provider_dataClassification_check" CHECK ("dataClassification" IN ('production', 'demo', 'fixture'));

ALTER TABLE "ProviderIntegrationConnection" ADD CONSTRAINT "ProviderIntegrationConnection_status_check" CHECK ("status" IN ('not_configured', 'pending', 'connected', 'requires_attention', 'syncing', 'error', 'revoked'));

ALTER TABLE "ProviderIntegrationConnection" ADD CONSTRAINT "ProviderIntegrationConnection_mode_check" CHECK ("mode" IN ('sandbox', 'production'));

ALTER TABLE "ProviderIntegrationConnection" ADD CONSTRAINT "ProviderIntegrationConnection_endpoint_url_check" CHECK ("endpointUrl" IS NULL OR "endpointUrl" ~ '^https://');

ALTER TABLE "ProviderIntegrationCredential" ADD CONSTRAINT "ProviderIntegrationCredential_auth_type_check" CHECK ("authType" IN ('api_key', 'oauth2', 'reference'));

ALTER TABLE "ProviderIntegrationMapping" ADD CONSTRAINT "ProviderIntegrationMapping_status_check" CHECK ("status" IN ('active', 'inactive'));

ALTER TABLE "ProviderIntegrationMapping" ADD CONSTRAINT "ProviderIntegrationMapping_local_entity_type_check" CHECK ("localEntityType" IN ('provider', 'product', 'variant', 'rate_plan', 'tax', 'calendar'));

ALTER TABLE "ProviderIntegrationMapping" ADD CONSTRAINT "ProviderIntegrationMapping_type_local_entity_pair_check" CHECK ((
				("mappingType" = 'property' AND "localEntityType" = 'product')
				OR ("mappingType" = 'room_type' AND "localEntityType" = 'variant')
				OR ("mappingType" = 'rate_plan' AND "localEntityType" = 'rate_plan')
				OR ("mappingType" = 'tax' AND "localEntityType" = 'tax')
				OR ("mappingType" = 'account' AND "localEntityType" = 'provider')
				OR ("mappingType" = 'calendar' AND "localEntityType" = 'calendar')
			));

ALTER TABLE "ProviderIntegrationCertification" ADD CONSTRAINT "ProviderIntegrationCertification_status_check" CHECK ("status" IN ('draft', 'prepared', 'ready', 'running', 'requires_attention', 'completed', 'expired', 'revoked'));

ALTER TABLE "ProviderIntegrationSyncRun" ADD CONSTRAINT "ProviderIntegrationSyncRun_status_check" CHECK ("status" IN ('running', 'succeeded', 'partial', 'failed', 'cancelled'));

ALTER TABLE "ProviderIntegrationSyncJob" ADD CONSTRAINT "ProviderIntegrationSyncJob_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));

ALTER TABLE "ProviderIntegrationIncident" ADD CONSTRAINT "ProviderIntegrationIncident_status_check" CHECK ("status" IN ('open', 'resolved'));

ALTER TABLE "ProviderIntegrationIncident" ADD CONSTRAINT "ProviderIntegrationIncident_severity_check" CHECK ("severity" IN ('info', 'warning', 'error', 'critical'));

ALTER TABLE "ProviderExternalCalendar" ADD CONSTRAINT "ProviderExternalCalendar_status_check" CHECK ("status" IN ('pending', 'active', 'error', 'revoked'));

ALTER TABLE "ProviderExternalCalendarConflict" ADD CONSTRAINT "ProviderExternalCalendarConflict_status_check" CHECK ("status" IN ('open', 'accepted', 'ignored', 'resolved'));

ALTER TABLE "ProviderExternalCalendarExport" ADD CONSTRAINT "ProviderExternalCalendarExport_status_check" CHECK ("status" IN ('active', 'revoked'));

ALTER TABLE "ProviderComplianceAssignment" ADD CONSTRAINT "ProviderComplianceAssignment_domain_check" CHECK ("domain" IN ('verification', 'fiscal', 'documents', 'payments'));

ALTER TABLE "ProviderComplianceAssignment" ADD CONSTRAINT "ProviderComplianceAssignment_status_check" CHECK ("status" IN ('open', 'done', 'canceled'));

ALTER TABLE "ProviderComplianceAssignment" ADD CONSTRAINT "ProviderComplianceAssignment_sla_hours_check" CHECK ("slaHours" BETWEEN 1 AND 168);

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_placeType_check" CHECK ("placeType" IN ('country', 'admin_area_1', 'admin_area_2', 'city', 'locality', 'neighborhood', 'poi', 'natural_area'));

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$');

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_canonicalPath_format_check" CHECK ("canonicalPath" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$');

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_status_check" CHECK ("status" IN ('active', 'hidden', 'merged'));

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_coordinates_check" CHECK (("centroidLat" IS NULL AND "centroidLng" IS NULL) OR ("centroidLat" BETWEEN -90 AND 90 AND "centroidLng" BETWEEN -180 AND 180));

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_parent_not_self_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");

ALTER TABLE "GeoPlace" ADD CONSTRAINT "GeoPlace_merge_not_self_check" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");

ALTER TABLE "GeoPlaceClosure" ADD CONSTRAINT "GeoPlaceClosure_depth_check" CHECK ("depth" >= 0);

ALTER TABLE "GeoPlaceClosure" ADD CONSTRAINT "GeoPlaceClosure_self_depth_check" CHECK (("ancestorId" = "descendantId" AND "depth" = 0) OR ("ancestorId" <> "descendantId" AND "depth" > 0));

ALTER TABLE "GeoPlaceAlias" ADD CONSTRAINT "GeoPlaceAlias_aliasType_check" CHECK ("aliasType" IN ('primary', 'alternate', 'historic', 'transliteration', 'search'));

ALTER TABLE "GeoPlaceContent" ADD CONSTRAINT "GeoPlaceContent_publicationStatus_check" CHECK ("publicationStatus" IN ('draft', 'published', 'archived'));

ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_sortOrder_nonnegative" CHECK ("sortOrder" >= 0);

ALTER TABLE "VariantImage" ADD CONSTRAINT "VariantImage_sortOrder_nonnegative" CHECK ("sortOrder" >= 0);

ALTER TABLE "Product" ADD CONSTRAINT "Product_publicationState_check" CHECK ("publicationState" IN ('draft', 'ready', 'published'));

ALTER TABLE "ProductGeoPlace" ADD CONSTRAINT "ProductGeoPlace_role_check" CHECK ("role" IN ('primary_discovery', 'secondary_discovery', 'service_area', 'meeting_area'));

ALTER TABLE "ProductGeoPlace" ADD CONSTRAINT "ProductGeoPlace_primary_role_check" CHECK ("isPrimary" = false OR "role" = 'primary_discovery');

ALTER TABLE "MarketplaceCommercialCertificationRun" ADD CONSTRAINT "MarketplaceCommercialCertificationRun_status_check" CHECK ("status" IN ('prepared', 'running', 'passed', 'failed'));

ALTER TABLE "ProductOperationalSurface" ADD CONSTRAINT "ProductOperationalSurface_preparation_status_variant_check" CHECK ("preparationStatusVariant" IN ('success', 'info', 'warning'));

ALTER TABLE "ProductOperationalSurface" ADD CONSTRAINT "ProductOperationalSurface_readiness_percent_check" CHECK ("readinessPercent" BETWEEN 0 AND 100);

ALTER TABLE "ProductOperationalSurface" ADD CONSTRAINT "ProductOperationalSurface_blocker_count_check" CHECK ("blockerCount" >= 0);

ALTER TABLE "HouseRule" ADD CONSTRAINT "HouseRule_scope_check" CHECK ("scope" IN ('product', 'variant'));

ALTER TABLE "HouseRule" ADD CONSTRAINT "HouseRule_scope_shape_check" CHECK (("scope" = 'product' AND "scopeId" IS NULL) OR ("scope" = 'variant' AND "scopeId" IS NOT NULL));

ALTER TABLE "HouseRule" ADD CONSTRAINT "HouseRule_variant_type_check" CHECK ("scope" = 'product' OR "type" IN ('Pets', 'Smoking', 'Access', 'Safety', 'ExtraBeds'));

ALTER TABLE "TourSlotProfile" ADD CONSTRAINT "TourSlotProfile_bookingMode_check" CHECK ("bookingMode" in ('shared', 'private'));

ALTER TABLE "TourSlotProfile" ADD CONSTRAINT "TourSlotProfile_maxPax_check" CHECK ("maxPax" >= 1);

ALTER TABLE "TourTicketType" ADD CONSTRAINT "TourTicketType_code_check" CHECK ("code" in ('adult', 'child', 'infant', 'custom'));

ALTER TABLE "TourPrivateRequest" ADD CONSTRAINT "TourPrivateRequest_status_check" CHECK ("status" in ('pending', 'accepted', 'declined', 'expired', 'cancelled'));

ALTER TABLE "Variant" ADD CONSTRAINT "Variant_lifecycleState_check" CHECK ("lifecycleState" IN ('draft', 'ready', 'archived'));

ALTER TABLE "Variant" ADD CONSTRAINT "Variant_sales_requires_ready_check" CHECK (NOT "salesEnabled" OR "lifecycleState" = 'ready');

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_vertical_format_check" CHECK ("vertical" ~ '^[a-z][a-z0-9_]*$');

ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);

ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_status_check" CHECK ("status" in ('published', 'pending', 'rejected', 'hidden'));

ALTER TABLE "MarketplaceEvent" ADD CONSTRAINT "MarketplaceEvent_eventType_check" CHECK ("eventType" in ('impression', 'click', 'booking_attributed'));

ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_typed_target_check" CHECK ((
				("scope" = 'product' AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'variant' AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'rate_plan' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
			));

ALTER TABLE "PolicyExceptionRule" ADD CONSTRAINT "PolicyExceptionRule_typed_target_check" CHECK ((
				("scope" = 'global' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'product' AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'variant' AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'rate_plan' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
			));

ALTER TABLE "PolicyExceptionRule" ADD CONSTRAINT "PolicyExceptionRule_category_check" CHECK ("category" IS NULL OR "category" IN ('Cancellation', 'Payment', 'CheckIn', 'NoShow'));

ALTER TABLE "PolicyExceptionRule" ADD CONSTRAINT "PolicyExceptionRule_effective_range_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

ALTER TABLE "CompliancePolicySet" ADD CONSTRAINT "CompliancePolicySet_status_check" CHECK ("status" IN ('active', 'retired'));

ALTER TABLE "CompliancePolicyVersion" ADD CONSTRAINT "CompliancePolicyVersion_status_check" CHECK ("status" IN ('draft', 'published', 'retired'));

ALTER TABLE "ComplianceRequirementRule" ADD CONSTRAINT "ComplianceRequirementRule_domain_check" CHECK ("domain" IN ('verification', 'fiscal', 'documents', 'payments'));

ALTER TABLE "ComplianceRequirementRule" ADD CONSTRAINT "ComplianceRequirementRule_sla_check" CHECK ("slaHours" BETWEEN 1 AND 168);

ALTER TABLE "ComplianceDecisionReason" ADD CONSTRAINT "ComplianceDecisionReason_domain_check" CHECK ("domain" IS NULL OR "domain" IN ('verification', 'fiscal', 'documents', 'payments'));

ALTER TABLE "ComplianceDecisionReason" ADD CONSTRAINT "ComplianceDecisionReason_decision_check" CHECK ("decision" IN ('approved', 'rejected', 'requires_attention', 'request_information'));

ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_domain_check" CHECK ("domain" IN ('verification', 'fiscal', 'documents', 'payments'));

ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_status_check" CHECK ("status" IN ('open', 'in_review', 'waiting_information', 'blocked', 'resolved', 'closed', 'canceled'));

ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'critical'));

ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_riskTier_check" CHECK ("riskTier" IN ('standard', 'elevated', 'high'));

ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_status_check" CHECK ("status" IN ('open', 'in_progress', 'blocked', 'completed', 'canceled'));

ALTER TABLE "CaseAssignmentEvent" ADD CONSTRAINT "CaseAssignmentEvent_type_check" CHECK ("eventType" IN ('assigned', 'reassigned', 'unassigned', 'backfilled'));

ALTER TABLE "CaseSlaTimer" ADD CONSTRAINT "CaseSlaTimer_status_check" CHECK ("status" IN ('running', 'paused', 'breached', 'stopped'));

ALTER TABLE "CaseLink" ADD CONSTRAINT "CaseLink_type_check" CHECK ("linkType" IN ('duplicate', 'reverification', 'appeal', 'related_incident'));

ALTER TABLE "CaseLink" ADD CONSTRAINT "CaseLink_not_self_check" CHECK ("fromCaseId" <> "toCaseId");

ALTER TABLE "DomainEventOutbox" ADD CONSTRAINT "DomainEventOutbox_status_check" CHECK ("status" IN ('pending', 'processing', 'published', 'failed'));

ALTER TABLE "Hold" ADD CONSTRAINT "Hold_commercial_snapshot_check" CHECK (("commercialSnapshotVersion" = 'legacy' AND "priceQuoteId" IS NULL AND "commercialSnapshotJson" IS NULL) OR ("commercialSnapshotVersion" = 'hold_commercial_snapshot_v1' AND "priceQuoteId" IS NOT NULL AND "commercialSnapshotJson" IS NOT NULL AND ("commercialSnapshotJson" -> 'priceQuote' ->> 'quoteId') = "priceQuoteId"));

ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_idempotency_pair_check" CHECK ((
				("idempotencyKey" IS NULL AND "idempotencyPayloadHash" IS NULL)
				OR (
					"idempotencyKey" IS NOT NULL
					AND "providerId" IS NOT NULL
					AND length(trim("idempotencyKey")) > 0
					AND "idempotencyPayloadHash" ~ '^[a-f0-9]{64}$'
				)
			));

ALTER TABLE "CommercialRuleApplication" ADD CONSTRAINT "CommercialRuleApplication_typed_target_check" CHECK ((
				("scope" = 'product' AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'variant' AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'rate_plan' AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
			));

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_status_check" CHECK ("status" IN ('queued', 'running', 'finalizing', 'succeeded', 'partial', 'failed', 'requires_attention', 'cancelled'));

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_operationType_check" CHECK ("operationType" IN ('create_pricing_rule', 'preview_pricing_rule'));

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_idempotencyKey_not_blank" CHECK (length(trim("idempotencyKey")) > 0);

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_payloadHash_sha256_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts");

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_finalizationAttempts_check" CHECK ("finalizationAttempts" >= 0 AND "finalizationMaxAttempts" > 0 AND "finalizationAttempts" <= "finalizationMaxAttempts");

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_progress_nonnegative_check" CHECK ("totalItems" >= 0 AND "pendingItems" >= 0 AND "runningItems" >= 0 AND "completedItems" >= 0 AND "succeededItems" >= 0 AND "failedItems" >= 0 AND "skippedItems" >= 0 AND "cancelledItems" >= 0);

ALTER TABLE "PricingBulkOperationJob" ADD CONSTRAINT "PricingBulkOperationJob_progress_balance_check" CHECK ("completedItems" = "succeededItems" + "failedItems" + "skippedItems" + "cancelledItems" AND "totalItems" = "pendingItems" + "runningItems" + "completedItems");

ALTER TABLE "PricingBulkOperationItem" ADD CONSTRAINT "PricingBulkOperationItem_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'));

ALTER TABLE "PricingBulkOperationItem" ADD CONSTRAINT "PricingBulkOperationItem_attempts_check" CHECK ("attempts" >= 0);

ALTER TABLE "TaxFeeAssignment" ADD CONSTRAINT "TaxFeeAssignment_typed_target_check" CHECK ((
				("scope" = 'global' AND "providerTargetId" IS NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'provider' AND "providerTargetId" IS NOT NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'product' AND "providerTargetId" IS NULL AND "productTargetId" IS NOT NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'variant' AND "providerTargetId" IS NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NOT NULL AND "ratePlanTargetId" IS NULL)
				OR ("scope" = 'rate_plan' AND "providerTargetId" IS NULL AND "productTargetId" IS NULL AND "variantTargetId" IS NULL AND "ratePlanTargetId" IS NOT NULL)
			));

ALTER TABLE "BookingVoucher" ADD CONSTRAINT "BookingVoucher_status_check" CHECK ("status" in ('issued', 'redeemed', 'void'));

ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_external_association_target_check" CHECK ((
				"type" = 'external_evidence_associated'
				AND num_nonnulls("paymentTransactionId", "settlementRecordId") = 1
				AND "financialExceptionId" IS NULL
				AND "financialReferenceId" IS NULL
				AND "refundHandoffId" IS NULL
				AND "reconciliationMatchId" IS NULL
			) OR (
				"type" <> 'external_evidence_associated'
				AND "paymentTransactionId" IS NULL
				AND "settlementRecordId" IS NULL
			));

ALTER TABLE "InternalRole" ADD CONSTRAINT "InternalRole_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{2,95}$');

ALTER TABLE "InternalPermission" ADD CONSTRAINT "InternalPermission_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9_.-]{2,127}$');

ALTER TABLE "InternalUserRole" ADD CONSTRAINT "InternalUserRole_scope_shape_check" CHECK (("scopeType" = 'global' AND "scopeId" IS NULL) OR ("scopeType" <> 'global' AND "scopeId" IS NOT NULL));

ALTER TABLE "InternalUserRole" ADD CONSTRAINT "InternalUserRole_status_check" CHECK ("status" IN ('active', 'revoked', 'expired'));

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_outcome_check" CHECK ("outcome" IN ('attempted', 'succeeded', 'denied', 'failed'));

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_risk_check" CHECK ("riskLevel" IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE "SensitiveDataAccessEvent" ADD CONSTRAINT "SensitiveDataAccessEvent_type_check" CHECK ("accessType" IN ('reveal', 'download', 'export'));

ALTER TABLE "CommandIdempotency" ADD CONSTRAINT "CommandIdempotency_status_check" CHECK ("status" IN ('started', 'succeeded', 'failed'));



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

-- GeoPlace.slug is a local segment. canonicalPath is always derived from the
-- hierarchy so direct writes cannot recreate a globally-unique-slug model.
CREATE OR REPLACE FUNCTION fastt_derive_geo_place_canonical_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	parent_path text;
BEGIN
	NEW."slug" := trim(BOTH '-' FROM regexp_replace(lower(trim(NEW."slug")), '[^a-z0-9]+', '-', 'g'));
	IF NEW."slug" !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
		RAISE EXCEPTION 'GEO_PLACE_INVALID_ROUTE_SEGMENT';
	END IF;

	IF NEW."parentId" IS NULL THEN
		NEW."canonicalPath" := NEW."slug";
	ELSE
		IF NEW."parentId" = NEW."id" THEN
			RAISE EXCEPTION 'GEO_PLACE_PARENT_CANNOT_BE_SELF';
		END IF;

		IF TG_OP = 'UPDATE' AND EXISTS (
			WITH RECURSIVE descendants AS (
				SELECT "id" FROM "GeoPlace" WHERE "parentId" = NEW."id"
				UNION ALL
				SELECT child."id"
				FROM "GeoPlace" child
				INNER JOIN descendants parent ON child."parentId" = parent."id"
			)
			SELECT 1 FROM descendants WHERE "id" = NEW."parentId"
		) THEN
			RAISE EXCEPTION 'GEO_PLACE_HIERARCHY_CYCLE';
		END IF;

		SELECT "canonicalPath" INTO parent_path
		FROM "GeoPlace"
		WHERE "id" = NEW."parentId";
		IF parent_path IS NULL THEN
			RAISE EXCEPTION 'GEO_PLACE_PARENT_NOT_FOUND';
		END IF;
		NEW."canonicalPath" := parent_path || '/' || NEW."slug";
	END IF;

	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_propagate_geo_place_canonical_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath" THEN
		UPDATE "GeoPlace" child
		SET "canonicalPath" = NEW."canonicalPath" || '/' || child."slug"
		WHERE child."parentId" = NEW."id"
			AND child."canonicalPath" IS DISTINCT FROM NEW."canonicalPath" || '/' || child."slug";
	END IF;
	RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_enforce_marketplace_publication_boundary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	product_class text;
BEGIN
	IF TG_TABLE_NAME = 'ProductContent' THEN
		SELECT "dataClass" INTO product_class FROM "Product" WHERE "id" = NEW."productId";
		IF product_class IS NULL THEN
			RAISE EXCEPTION 'PRODUCT_CONTENT_REQUIRES_PRODUCT';
		END IF;
		IF NEW."dataClass" IS DISTINCT FROM product_class THEN
			RAISE EXCEPTION 'PRODUCT_CONTENT_DATA_CLASS_MISMATCH';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_TABLE_NAME = 'Product' THEN
		IF NEW."publicationState" <> 'published' THEN
			RETURN NEW;
		END IF;
		IF NOT EXISTS (
			SELECT 1
			FROM "Product" product
			INNER JOIN "Provider" provider ON provider."id" = product."providerId"
			WHERE product."id" = NEW."id"
				AND product."dataClass" = 'production'
				AND provider."accountPurpose" = 'commercial'
				AND provider."dataClassification" = 'production'
		) THEN
			RAISE EXCEPTION 'PUBLIC_PRODUCT_PROVIDER_NOT_ELIGIBLE';
		END IF;
		RETURN NEW;
	END IF;

	IF TG_TABLE_NAME = 'Provider' THEN
		IF (NEW."accountPurpose" <> 'commercial' OR NEW."dataClassification" <> 'production')
			AND EXISTS (
				SELECT 1
				FROM "Product" product
				WHERE product."providerId" = NEW."id"
					AND product."dataClass" = 'production'
					AND product."publicationState" = 'published'
			) THEN
			RAISE EXCEPTION 'PROVIDER_HAS_PUBLISHED_PRODUCTION_PRODUCTS';
		END IF;
		RETURN NEW;
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
		'ProviderIntegrationCertification',
		'ProviderComplianceAssignment',
		'ProviderConfigurationState',
		'ProviderInvitation',
		'ProductOperationalSurface',
		'VariantRoomProfile',
		'TourSlotProfile',
		'TourTicketType',
		'BookingVoucher',
		'ProductCategory',
		'ProductCategoryLink',
		'ProductReview',
		'DailyInventory',
		'RatePlanConditionState',
		'CommercialRuleSet',
		'CommercialRule',
		'PricingBulkOperationJob',
		'PricingBulkOperationItem',
		'TaxFeeDefinition',
		'FinancialExceptionRecord',
		'RefundHandoffRecord',
		'PaymentTransaction',
		'ReconciliationMatch',
		'ProviderFinancialProfile',
		'FinancialProviderSummary',
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

ALTER TABLE "BookingLineItem"
	ADD CONSTRAINT "BookingLineItem_guest_counts_check"
	CHECK ("adults" >= 0 AND "children" >= 0 AND ("adults" + "children") > 0),
	ADD CONSTRAINT "BookingLineItem_amounts_nonnegative_check"
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

-- A current fiscal version is an immutable release of the same definition.
-- The composite, deferred FK protects both facts: the referenced version exists
-- and it belongs to this definition. A new draft may legitimately have no pointer.
ALTER TABLE "TaxFeeDefinitionVersion"
	ADD CONSTRAINT "TaxFeeDefinitionVersion_definition_id_unique"
	UNIQUE ("taxFeeDefinitionId", "id");

ALTER TABLE "TaxFeeDefinition"
	ADD CONSTRAINT "TaxFeeDefinition_currentVersion_same_definition_fk"
	FOREIGN KEY ("id", "currentVersionId")
	REFERENCES "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "id")
	DEFERRABLE INITIALLY DEFERRED;

-- Fiscal versions are append-only evidence. Definitions can move their current
-- pointer, but a released snapshot is never rewritten or removed in place.
CREATE OR REPLACE FUNCTION fastt_prevent_tax_fee_definition_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'TAX_FEE_DEFINITION_VERSION_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeDefinitionVersion_immutable" ON "TaxFeeDefinitionVersion";
CREATE TRIGGER "trg_TaxFeeDefinitionVersion_immutable"
BEFORE UPDATE OR DELETE ON "TaxFeeDefinitionVersion"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_tax_fee_definition_version_mutation();

-- A definition is not commercially published until it points at an immutable
-- version. This must be deferred because the release transaction inserts the
-- snapshot and advances the pointer before commit.
CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_definition_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."editingState" = 'published' AND NEW."currentVersionId" IS NULL THEN
		RAISE EXCEPTION 'TAX_FEE_PUBLISHED_DEFINITION_REQUIRES_CURRENT_VERSION';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeDefinition_published_version_required" ON "TaxFeeDefinition";
CREATE CONSTRAINT TRIGGER "trg_TaxFeeDefinition_published_version_required"
AFTER INSERT OR UPDATE OF "editingState", "currentVersionId" ON "TaxFeeDefinition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_tax_fee_definition_publication();

CREATE UNIQUE INDEX IF NOT EXISTS "RatePlan_one_default_active_per_variant_idx"
	ON "RatePlan" ("variantId")
	WHERE "isDefault" = true AND "isActive" = true;

CREATE INDEX IF NOT EXISTS "PolicyAssignment_active_resolution_range_idx"
	ON "PolicyAssignment" ("scope", "scopeId", "category", "channel", "effectiveFrom", "effectiveTo")
	WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "SearchUnitView_available_search_idx"
	ON "SearchUnitView" ("productId", "date", "occupancyKey", "pricePerNight")
	WHERE "isAvailable" = true;

CREATE INDEX IF NOT EXISTS "ProviderVerification_providerId_created_idx"
	ON "ProviderVerification" ("providerId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "ProviderInvitation_providerId_created_idx"
	ON "ProviderInvitation" ("providerId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "RatePlanOccupancyPolicy_ratePlan_current_idx"
	ON "RatePlanOccupancyPolicy" ("ratePlanId", "effectiveFrom", "id", "effectiveTo");

CREATE INDEX IF NOT EXISTS "EffectivePricing_ratePlan_occupancy_date_idx"
	ON "EffectivePricing" ("ratePlanId", "occupancyKey", "date", "computedAt");

CREATE INDEX IF NOT EXISTS "TaxFeeDefinition_provider_status_priority_idx"
	ON "TaxFeeDefinition" ("providerId", "status", "priority");

CREATE INDEX IF NOT EXISTS "TaxFeeDefinition_provider_code_status_idx"
	ON "TaxFeeDefinition" ("providerId", "code", "status");

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_scope_active_channel_idx"
	ON "TaxFeeAssignment" ("scope", "scopeId", "status", "channel");

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_definition_scope_active_idx"
	ON "TaxFeeAssignment" ("taxFeeDefinitionId", "scope", "scopeId", "status", "channel");

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
BEFORE UPDATE OF "scope", "productTargetId", "variantTargetId", "ratePlanTargetId", "category", "channel", "effectiveFrom", "effectiveTo", "isActive"
ON "PolicyAssignment"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_policy_assignment_overlap();

DROP TRIGGER IF EXISTS "trg_Hold_positive_range" ON "Hold";
CREATE TRIGGER "trg_Hold_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "Hold"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_BookingLineItem_positive_range" ON "BookingLineItem";
CREATE TRIGGER "trg_BookingLineItem_positive_range"
BEFORE INSERT OR UPDATE OF "checkIn", "checkOut"
ON "BookingLineItem"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_stay_range();

DROP TRIGGER IF EXISTS "trg_Booking_positive_range" ON "Booking";
CREATE TRIGGER "trg_Booking_positive_range"
BEFORE INSERT OR UPDATE OF "checkInDate", "checkOutDate"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION fastt_assert_positive_booking_range();

DROP TRIGGER IF EXISTS "trg_ProductContent_publication_boundary" ON "ProductContent";
CREATE TRIGGER "trg_ProductContent_publication_boundary"
BEFORE INSERT OR UPDATE OF "productId", "dataClass" ON "ProductContent"
FOR EACH ROW
EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_Product_publication_boundary" ON "Product";
CREATE TRIGGER "trg_Product_publication_boundary"
BEFORE INSERT OR UPDATE OF "publicationState", "providerId", "dataClass" ON "Product"
FOR EACH ROW
EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_Provider_publication_boundary" ON "Provider";
CREATE TRIGGER "trg_Provider_publication_boundary"
BEFORE UPDATE OF "accountPurpose", "dataClassification" ON "Provider"
FOR EACH ROW
EXECUTE FUNCTION fastt_enforce_marketplace_publication_boundary();

DROP TRIGGER IF EXISTS "trg_GeoPlace_derive_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_derive_canonical_path"
BEFORE INSERT OR UPDATE OF "slug", "parentId", "canonicalPath" ON "GeoPlace"
FOR EACH ROW
EXECUTE FUNCTION fastt_derive_geo_place_canonical_path();

DROP TRIGGER IF EXISTS "trg_GeoPlace_propagate_canonical_path" ON "GeoPlace";
CREATE TRIGGER "trg_GeoPlace_propagate_canonical_path"
AFTER UPDATE ON "GeoPlace"
FOR EACH ROW
WHEN (OLD."canonicalPath" IS DISTINCT FROM NEW."canonicalPath")
EXECUTE FUNCTION fastt_propagate_geo_place_canonical_path();
-- Category slugs are scoped by vertical. Category links must stay in the
-- same vertical as the product, even when data is written outside the API.
CREATE OR REPLACE FUNCTION fastt_validate_product_category_vertical()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	product_vertical text;
	category_vertical text;
BEGIN
	SELECT lower(trim(product."productType")), lower(trim(category.vertical))
	INTO product_vertical, category_vertical
	FROM "Product" product
	JOIN "ProductCategory" category ON category.id = NEW."categoryId"
	WHERE product.id = NEW."productId";

	IF product_vertical IS NULL OR category_vertical IS NULL THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_LINK_REFERENCES_MISSING_RESOURCE';
	END IF;

	IF product_vertical <> category_vertical THEN
		RAISE EXCEPTION 'PRODUCT_CATEGORY_VERTICAL_MISMATCH: product %, category %',
			product_vertical, category_vertical;
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductCategoryLink_vertical_match" ON "ProductCategoryLink";
CREATE TRIGGER "trg_ProductCategoryLink_vertical_match"
BEFORE INSERT OR UPDATE OF "productId", "categoryId" ON "ProductCategoryLink"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_product_category_vertical();

CREATE OR REPLACE FUNCTION fastt_house_rule_variant_belongs_to_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."scope" = 'variant' THEN
		IF NOT EXISTS (
			SELECT 1
			FROM "Variant"
			WHERE "Variant"."id" = NEW."scopeId"
				AND "Variant"."productId" = NEW."productId"
				AND "Variant"."kind" = 'hotel_room'
		) THEN
			RAISE EXCEPTION 'HOUSE_RULE_VARIANT_SCOPE_MISMATCH';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_HouseRule_variant_product" ON "HouseRule";
CREATE TRIGGER "trg_HouseRule_variant_product"
BEFORE INSERT OR UPDATE OF "scope", "scopeId", "productId" ON "HouseRule"
FOR EACH ROW
EXECUTE FUNCTION fastt_house_rule_variant_belongs_to_product();

-- Catalog media has typed ownership. A stored asset can belong to one catalog
-- gallery only; location content may still reference it independently as a hero.
CREATE OR REPLACE FUNCTION fastt_prevent_catalog_image_owner_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_TABLE_NAME = 'ProductImage' AND EXISTS (
		SELECT 1 FROM "VariantImage" WHERE "imageId" = NEW."imageId"
	) THEN
		RAISE EXCEPTION 'CATALOG_IMAGE_ALREADY_LINKED_TO_VARIANT';
	END IF;

	IF TG_TABLE_NAME = 'VariantImage' AND EXISTS (
		SELECT 1 FROM "ProductImage" WHERE "imageId" = NEW."imageId"
	) THEN
		RAISE EXCEPTION 'CATALOG_IMAGE_ALREADY_LINKED_TO_PRODUCT';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProductImage_single_catalog_owner" ON "ProductImage";
CREATE TRIGGER "trg_ProductImage_single_catalog_owner"
BEFORE INSERT OR UPDATE OF "imageId" ON "ProductImage"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_catalog_image_owner_overlap();

-- Integration mappings are polymorphic for connector interoperability, but
-- their local identity must still use Fastt's canonical vocabulary and belong
-- to the same provider. This closes the gap left by a generic localEntityId.
CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_mapping_local_entity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF (NEW."mappingType" = 'property' AND NEW."localEntityType" = 'product') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "Product"
			WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'room_type' AND NEW."localEntityType" = 'variant') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "Variant" variant
			JOIN "Product" product ON product."id" = variant."productId"
			WHERE variant."id" = NEW."localEntityId" AND product."providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'rate_plan' AND NEW."localEntityType" = 'rate_plan') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "RatePlan" rate_plan
			JOIN "Variant" variant ON variant."id" = rate_plan."variantId"
			JOIN "Product" product ON product."id" = variant."productId"
			WHERE rate_plan."id" = NEW."localEntityId" AND product."providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'tax' AND NEW."localEntityType" = 'tax') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "TaxFeeDefinition"
			WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'calendar' AND NEW."localEntityType" = 'calendar') THEN
		IF NOT EXISTS (
			SELECT 1 FROM "ProviderExternalCalendar"
			WHERE "id" = NEW."localEntityId" AND "providerId" = NEW."providerId"
		) THEN RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED'; END IF;
	ELSIF (NEW."mappingType" = 'account' AND NEW."localEntityType" = 'provider') THEN
		IF NEW."localEntityId" <> NEW."providerId" THEN
			RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_NOT_OWNED';
		END IF;
	ELSE
		RAISE EXCEPTION 'INTEGRATION_MAPPING_LOCAL_ENTITY_TYPE_INVALID';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationMapping_local_entity" ON "ProviderIntegrationMapping";
CREATE TRIGGER "trg_ProviderIntegrationMapping_local_entity"
BEFORE INSERT OR UPDATE OF "providerId", "mappingType", "localEntityType", "localEntityId"
ON "ProviderIntegrationMapping"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_provider_integration_mapping_local_entity();

-- A certification fixture is evidence for an isolated provider. The direct FK
-- prevents orphan products; this trigger also prevents cross-provider or
-- commercial products from being used as certification inventory.
CREATE OR REPLACE FUNCTION fastt_validate_provider_integration_certification_fixture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "Provider"
		WHERE "id" = NEW."providerId" AND "accountPurpose" = 'integration_certification'
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_INVALID'; END IF;
	IF NEW."fixtureProductId" IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "Product"
		WHERE "id" = NEW."fixtureProductId"
			AND "providerId" = NEW."providerId"
			AND "dataClass" = 'fixture'
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_INVALID'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_certification_fixture_product_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "ProviderIntegrationCertification"
		WHERE "fixtureProductId" = NEW."id"
			AND ("providerId" IS DISTINCT FROM NEW."providerId" OR NEW."dataClass" <> 'fixture')
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_FIXTURE_PRODUCT_DRIFT'; END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_certification_provider_purpose_drift()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."accountPurpose" <> 'integration_certification' AND EXISTS (
		SELECT 1 FROM "ProviderIntegrationCertification" WHERE "providerId" = NEW."id"
	) THEN RAISE EXCEPTION 'INTEGRATION_CERTIFICATION_PROVIDER_PURPOSE_DRIFT'; END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_ProviderIntegrationCertification_fixture" ON "ProviderIntegrationCertification";
CREATE TRIGGER "trg_ProviderIntegrationCertification_fixture"
BEFORE INSERT OR UPDATE OF "providerId", "fixtureProductId"
ON "ProviderIntegrationCertification"
FOR EACH ROW
EXECUTE FUNCTION fastt_validate_provider_integration_certification_fixture();

DROP TRIGGER IF EXISTS "trg_Product_certification_fixture_drift" ON "Product";
CREATE TRIGGER "trg_Product_certification_fixture_drift"
BEFORE UPDATE OF "providerId", "dataClass" ON "Product"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_certification_fixture_product_drift();

DROP TRIGGER IF EXISTS "trg_Provider_certification_fixture_drift" ON "Provider";
CREATE TRIGGER "trg_Provider_certification_fixture_drift"
BEFORE UPDATE OF "accountPurpose" ON "Provider"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_certification_provider_purpose_drift();

DROP TRIGGER IF EXISTS "trg_VariantImage_single_catalog_owner" ON "VariantImage";
CREATE TRIGGER "trg_VariantImage_single_catalog_owner"
BEFORE INSERT OR UPDATE OF "imageId" ON "VariantImage"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_catalog_image_owner_overlap();

ALTER TABLE "HouseRule"
	DROP CONSTRAINT IF EXISTS "HouseRule_scope_check",
	DROP CONSTRAINT IF EXISTS "HouseRule_scope_shape_check",
	DROP CONSTRAINT IF EXISTS "HouseRule_variant_type_check";

ALTER TABLE "HouseRule"
	ADD CONSTRAINT "HouseRule_scope_check"
	CHECK ("scope" IN ('product', 'variant')),
	ADD CONSTRAINT "HouseRule_scope_shape_check"
	CHECK (
		("scope" = 'product' AND "scopeId" IS NULL)
		OR ("scope" = 'variant' AND "scopeId" IS NOT NULL)
	),
	ADD CONSTRAINT "HouseRule_variant_type_check"
	CHECK (
		"scope" = 'product'
		OR "type" IN ('Pets', 'Smoking', 'Access', 'Safety', 'ExtraBeds')
	);

-- A bulk command is the audit-grade intent accepted from the administrator.
-- Workers may update lifecycle/progress fields only; changing the command
-- would make retries non-reproducible and invalidate the payload hash.
CREATE OR REPLACE FUNCTION fastt_prevent_pricing_bulk_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."providerId" IS DISTINCT FROM OLD."providerId"
		OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
		OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
		OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
		OR NEW."operationType" IS DISTINCT FROM OLD."operationType"
		OR NEW."commandJson" IS DISTINCT FROM OLD."commandJson" THEN
		RAISE EXCEPTION 'PRICING_BULK_OPERATION_COMMAND_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_PricingBulkOperationJob_command_immutable" ON "PricingBulkOperationJob";
CREATE TRIGGER "trg_PricingBulkOperationJob_command_immutable"
BEFORE UPDATE ON "PricingBulkOperationJob"
FOR EACH ROW
EXECUTE FUNCTION fastt_prevent_pricing_bulk_command_mutation();



-- Canonical typed assignment ownership invariants.

-- Child writes lock and validate the complete ownership chain. Parent ownership
-- identities are immutable; aggregate transfers must use an explicit migration.
CREATE OR REPLACE FUNCTION fastt_catalog_assignment_target_provider(
	product_target_id text,
	variant_target_id text,
	rate_plan_target_id text
)
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE target_provider_id text;
BEGIN
	IF product_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "Product" product WHERE product."id" = product_target_id
		FOR SHARE OF product;
	ELSIF variant_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "Variant" variant
		JOIN "Product" product ON product."id" = variant."productId"
		WHERE variant."id" = variant_target_id
		FOR SHARE OF variant, product;
	ELSIF rate_plan_target_id IS NOT NULL THEN
		SELECT product."providerId" INTO target_provider_id
		FROM "RatePlan" rate_plan
		JOIN "Variant" variant ON variant."id" = rate_plan."variantId"
		JOIN "Product" product ON product."id" = variant."productId"
		WHERE rate_plan."id" = rate_plan_target_id
		FOR SHARE OF rate_plan, variant, product;
	END IF;
	RETURN target_provider_id;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_tax_fee_assignment_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition_provider_id text; target_provider_id text;
BEGIN
	SELECT "providerId" INTO definition_provider_id
	FROM "TaxFeeDefinition" WHERE "id" = NEW."taxFeeDefinitionId" FOR SHARE;
	IF NEW."scope" = 'global' THEN RETURN NEW; END IF;
	IF NEW."scope" = 'provider' THEN
		SELECT "id" INTO target_provider_id
		FROM "Provider" WHERE "id" = NEW."providerTargetId" FOR SHARE;
	ELSE
		target_provider_id := fastt_catalog_assignment_target_provider(
			NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
		);
	END IF;
	IF definition_provider_id IS NULL OR target_provider_id IS NULL OR definition_provider_id <> target_provider_id THEN
		RAISE EXCEPTION 'TAX_FEE_ASSIGNMENT_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_policy_assignment_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_provider_id text; target_provider_id text;
BEGIN
	SELECT "ownerProviderId" INTO group_provider_id
	FROM "PolicyGroup" WHERE "id" = NEW."policyGroupId" FOR SHARE;
	target_provider_id := fastt_catalog_assignment_target_provider(
		NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
	);
	IF group_provider_id IS NULL OR target_provider_id IS NULL OR group_provider_id <> target_provider_id THEN
		RAISE EXCEPTION 'POLICY_ASSIGNMENT_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_validate_commercial_rule_application_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule_provider_id text; rule_set_provider_id text; rule_set_id text; target_provider_id text;
BEGIN
	SELECT "providerId", "ruleSetId" INTO rule_provider_id, rule_set_id
	FROM "CommercialRule" WHERE "id" = NEW."ruleId" FOR SHARE;
	SELECT "providerId" INTO rule_set_provider_id
	FROM "CommercialRuleSet" WHERE "id" = NEW."ruleSetId" FOR SHARE;
	target_provider_id := fastt_catalog_assignment_target_provider(
		NEW."productTargetId", NEW."variantTargetId", NEW."ratePlanTargetId"
	);
	IF rule_provider_id IS NULL OR rule_set_provider_id IS NULL OR target_provider_id IS NULL
		OR NEW."providerId" <> rule_provider_id OR NEW."providerId" <> rule_set_provider_id
		OR NEW."ruleSetId" <> rule_set_id OR NEW."providerId" <> target_provider_id THEN
		RAISE EXCEPTION 'COMMERCIAL_RULE_APPLICATION_PROVIDER_MISMATCH';
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_catalog_assignment_owner_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_provider_id text; new_provider_id text;
BEGIN
	IF TG_TABLE_NAME = 'Product' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'PRODUCT_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'Variant' AND NEW."productId" IS DISTINCT FROM OLD."productId" THEN
		SELECT p."providerId" INTO old_provider_id FROM "Product" p WHERE p."id" = OLD."productId";
		SELECT p."providerId" INTO new_provider_id FROM "Product" p WHERE p."id" = NEW."productId";
		IF old_provider_id IS DISTINCT FROM new_provider_id THEN RAISE EXCEPTION 'VARIANT_CROSS_PROVIDER_MOVE_BLOCKED'; END IF;
	ELSIF TG_TABLE_NAME = 'RatePlan' AND NEW."variantId" IS DISTINCT FROM OLD."variantId" THEN
		SELECT p."providerId" INTO old_provider_id FROM "Variant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."id" = OLD."variantId";
		SELECT p."providerId" INTO new_provider_id FROM "Variant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."id" = NEW."variantId";
		IF old_provider_id IS DISTINCT FROM new_provider_id THEN RAISE EXCEPTION 'RATE_PLAN_CROSS_PROVIDER_MOVE_BLOCKED'; END IF;
	END IF;
	RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fastt_prevent_rule_assignment_owner_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'TaxFeeDefinition' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'TAX_FEE_DEFINITION_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'PolicyGroup' THEN
		IF NEW."ownerProviderId" IS DISTINCT FROM OLD."ownerProviderId" THEN
			RAISE EXCEPTION 'POLICY_GROUP_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'CommercialRule' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId"
			OR NEW."ruleSetId" IS DISTINCT FROM OLD."ruleSetId" THEN
			RAISE EXCEPTION 'COMMERCIAL_RULE_LINEAGE_IMMUTABLE';
		END IF;
	ELSIF TG_TABLE_NAME = 'CommercialRuleSet' THEN
		IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
			RAISE EXCEPTION 'COMMERCIAL_RULE_SET_PROVIDER_IDENTITY_IMMUTABLE';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_TaxFeeAssignment_owner" ON "TaxFeeAssignment";
CREATE TRIGGER "trg_TaxFeeAssignment_owner" BEFORE INSERT OR UPDATE OF "taxFeeDefinitionId", "scope", "providerTargetId", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "TaxFeeAssignment" FOR EACH ROW EXECUTE FUNCTION fastt_validate_tax_fee_assignment_owner();
DROP TRIGGER IF EXISTS "trg_PolicyAssignment_owner" ON "PolicyAssignment";
CREATE TRIGGER "trg_PolicyAssignment_owner" BEFORE INSERT OR UPDATE OF "policyGroupId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "PolicyAssignment" FOR EACH ROW EXECUTE FUNCTION fastt_validate_policy_assignment_owner();
DROP TRIGGER IF EXISTS "trg_CommercialRuleApplication_owner" ON "CommercialRuleApplication";
CREATE TRIGGER "trg_CommercialRuleApplication_owner" BEFORE INSERT OR UPDATE OF "providerId", "ruleSetId", "ruleId", "scope", "productTargetId", "variantTargetId", "ratePlanTargetId" ON "CommercialRuleApplication" FOR EACH ROW EXECUTE FUNCTION fastt_validate_commercial_rule_application_owner();

DROP TRIGGER IF EXISTS "trg_Product_assignment_owner_drift" ON "Product";
CREATE TRIGGER "trg_Product_assignment_owner_drift" BEFORE UPDATE OF "providerId" ON "Product" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_Variant_assignment_owner_drift" ON "Variant";
CREATE TRIGGER "trg_Variant_assignment_owner_drift" BEFORE UPDATE OF "productId" ON "Variant" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_RatePlan_assignment_owner_drift" ON "RatePlan";
CREATE TRIGGER "trg_RatePlan_assignment_owner_drift" BEFORE UPDATE OF "variantId" ON "RatePlan" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_catalog_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_TaxFeeDefinition_assignment_owner_drift" ON "TaxFeeDefinition";
CREATE TRIGGER "trg_TaxFeeDefinition_assignment_owner_drift" BEFORE UPDATE OF "providerId" ON "TaxFeeDefinition" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_PolicyGroup_assignment_owner_drift" ON "PolicyGroup";
CREATE TRIGGER "trg_PolicyGroup_assignment_owner_drift" BEFORE UPDATE OF "ownerProviderId" ON "PolicyGroup" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_CommercialRule_assignment_owner_drift" ON "CommercialRule";
CREATE TRIGGER "trg_CommercialRule_assignment_owner_drift" BEFORE UPDATE OF "providerId", "ruleSetId" ON "CommercialRule" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();
DROP TRIGGER IF EXISTS "trg_CommercialRuleSet_assignment_owner_drift" ON "CommercialRuleSet";
CREATE TRIGGER "trg_CommercialRuleSet_assignment_owner_drift" BEFORE UPDATE OF "providerId" ON "CommercialRuleSet" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_rule_assignment_owner_drift();



-- Canonical financial ownership and evidence invariants.

-- Financial ownership is a relational identity, not an application convention.
-- Composite foreign keys protect both child writes and later parent changes.
DO $$
DECLARE table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'FinancialExceptionRecord', 'FinancialReference', 'RefundHandoffRecord', 'RefundQuote',
		'RefundLedger', 'FinancialReviewEvent', 'PaymentTransaction', 'FinancialSettlementRecord',
		'ReconciliationMatch', 'CommissionSnapshot', 'ProviderPayableSnapshot', 'PayoutRecord'
	]
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || table_name || '_booking_provider', table_name);
	END LOOP;
END;
$$;
DROP TRIGGER IF EXISTS "trg_RefundLedger_lineage" ON "RefundLedger";
DROP TRIGGER IF EXISTS "trg_FinancialReviewEvent_lineage" ON "FinancialReviewEvent";
DROP FUNCTION IF EXISTS fastt_validate_financial_booking_provider();
DROP FUNCTION IF EXISTS fastt_validate_refund_ledger_lineage();
DROP FUNCTION IF EXISTS fastt_validate_financial_review_event_lineage();

ALTER TABLE "Booking"
	ADD CONSTRAINT "Booking_id_provider_unique" UNIQUE ("id", "providerId");

ALTER TABLE "FinancialExceptionRecord" ADD CONSTRAINT "FinancialExceptionRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "FinancialReference" ADD CONSTRAINT "FinancialReference_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "RefundHandoffRecord" ADD CONSTRAINT "RefundHandoffRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "RefundQuote" ADD CONSTRAINT "RefundQuote_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "RefundLedger" ADD CONSTRAINT "RefundLedger_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "FinancialSettlementRecord" ADD CONSTRAINT "FinancialSettlementRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "CommissionSnapshot" ADD CONSTRAINT "CommissionSnapshot_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "ProviderPayableSnapshot" ADD CONSTRAINT "ProviderPayableSnapshot_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_booking_provider_fk" FOREIGN KEY ("bookingId", "providerId") REFERENCES "Booking" ("id", "providerId");

-- Composite lineage keys make refund and review evidence concurrency-safe.
ALTER TABLE "RefundQuote" ADD CONSTRAINT "RefundQuote_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "FinancialSettlementRecord" ADD CONSTRAINT "FinancialSettlementRecord_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "FinancialExceptionRecord" ADD CONSTRAINT "FinancialExceptionRecord_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReference" ADD CONSTRAINT "FinancialReference_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "RefundHandoffRecord" ADD CONSTRAINT "RefundHandoffRecord_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_id_booking_provider_unique" UNIQUE ("id", "bookingId", "providerId");

ALTER TABLE "RefundLedger" ADD CONSTRAINT "RefundLedger_quote_lineage_fk" FOREIGN KEY ("refundQuoteId", "bookingId", "providerId") REFERENCES "RefundQuote" ("id", "bookingId", "providerId");
ALTER TABLE "RefundLedger" ADD CONSTRAINT "RefundLedger_payment_lineage_fk" FOREIGN KEY ("paymentTransactionId", "bookingId", "providerId") REFERENCES "PaymentTransaction" ("id", "bookingId", "providerId");

ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_exception_lineage_fk" FOREIGN KEY ("financialExceptionId", "bookingId", "providerId") REFERENCES "FinancialExceptionRecord" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_reference_lineage_fk" FOREIGN KEY ("financialReferenceId", "bookingId", "providerId") REFERENCES "FinancialReference" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_handoff_lineage_fk" FOREIGN KEY ("refundHandoffId", "bookingId", "providerId") REFERENCES "RefundHandoffRecord" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_reconciliation_lineage_fk" FOREIGN KEY ("reconciliationMatchId", "bookingId", "providerId") REFERENCES "ReconciliationMatch" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_payment_lineage_fk" FOREIGN KEY ("paymentTransactionId", "bookingId", "providerId") REFERENCES "PaymentTransaction" ("id", "bookingId", "providerId");
ALTER TABLE "FinancialReviewEvent" ADD CONSTRAINT "FinancialReviewEvent_settlement_lineage_fk" FOREIGN KEY ("settlementRecordId", "bookingId", "providerId") REFERENCES "FinancialSettlementRecord" ("id", "bookingId", "providerId");

CREATE OR REPLACE FUNCTION fastt_prevent_financial_identity_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'Booking' AND NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
		RAISE EXCEPTION 'BOOKING_PROVIDER_IDENTITY_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'RefundQuote' AND (NEW."bookingId", NEW."providerId") IS DISTINCT FROM (OLD."bookingId", OLD."providerId") THEN
		RAISE EXCEPTION 'REFUND_QUOTE_LINEAGE_IMMUTABLE';
	ELSIF TG_TABLE_NAME = 'RefundLedger' AND (NEW."refundQuoteId", NEW."bookingId", NEW."providerId", NEW."paymentTransactionId") IS DISTINCT FROM (OLD."refundQuoteId", OLD."bookingId", OLD."providerId", OLD."paymentTransactionId") THEN
		RAISE EXCEPTION 'REFUND_LEDGER_LINEAGE_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_Booking_financial_identity" BEFORE UPDATE OF "providerId" ON "Booking" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_identity_drift();
CREATE TRIGGER "trg_RefundQuote_financial_identity" BEFORE UPDATE OF "bookingId", "providerId" ON "RefundQuote" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_identity_drift();
CREATE TRIGGER "trg_RefundLedger_financial_identity" BEFORE UPDATE OF "refundQuoteId", "bookingId", "providerId", "paymentTransactionId" ON "RefundLedger" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_identity_drift();

-- Imported evidence may be linked exactly once. Corrections require explicit
-- compensating evidence instead of silently rewriting financial history.
CREATE OR REPLACE FUNCTION fastt_validate_external_evidence_identity_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
		RAISE EXCEPTION 'FINANCIAL_EVIDENCE_PROVIDER_IMMUTABLE';
	END IF;
	IF OLD."bookingId" IS NOT NULL AND NEW."bookingId" IS DISTINCT FROM OLD."bookingId" THEN
		RAISE EXCEPTION 'FINANCIAL_EVIDENCE_BOOKING_IMMUTABLE';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_PaymentTransaction_evidence_identity" BEFORE UPDATE OF "bookingId", "providerId" ON "PaymentTransaction" FOR EACH ROW EXECUTE FUNCTION fastt_validate_external_evidence_identity_transition();
CREATE TRIGGER "trg_FinancialSettlementRecord_evidence_identity" BEFORE UPDATE OF "bookingId", "providerId" ON "FinancialSettlementRecord" FOR EACH ROW EXECUTE FUNCTION fastt_validate_external_evidence_identity_transition();

CREATE OR REPLACE FUNCTION fastt_prevent_financial_review_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'FINANCIAL_REVIEW_EVENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER "trg_FinancialReviewEvent_immutable" BEFORE UPDATE OR DELETE ON "FinancialReviewEvent" FOR EACH ROW EXECUTE FUNCTION fastt_prevent_financial_review_event_mutation();



-- Financial booking candidate search indexes.

-- Candidate lookup is an operational search surface. These indexes keep it
-- bounded at provider scale without turning the financial inbox into a source
-- of truth for all reservations.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.fastt_search_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
	SELECT lower(public.unaccent('public.unaccent', value));
$$;

CREATE INDEX "Booking_provider_externalBookingId_idx"
	ON "Booking" ("providerId", "externalBookingId")
	WHERE "externalBookingId" IS NOT NULL;
CREATE INDEX "Booking_provider_checkInDate_idx" ON "Booking" ("providerId", "checkInDate");
CREATE INDEX "Booking_provider_checkOutDate_idx" ON "Booking" ("providerId", "checkOutDate");
CREATE INDEX "Booking_provider_recent_idx"
	ON "Booking" ("providerId", "confirmedAt" DESC, "bookingDate" DESC);
CREATE INDEX "Booking_guestNameSnapshot_trgm_idx"
	ON "Booking" USING gin (public.fastt_search_normalize(coalesce("guestNameSnapshot", '')) gin_trgm_ops)
	WHERE "guestNameSnapshot" IS NOT NULL;
CREATE INDEX "Booking_guestEmailSnapshot_trgm_idx"
	ON "Booking" USING gin (public.fastt_search_normalize(coalesce("guestEmailSnapshot", '')) gin_trgm_ops)
	WHERE "guestEmailSnapshot" IS NOT NULL;
CREATE INDEX "BookingLineItem_productNameSnapshot_trgm_idx"
	ON "BookingLineItem" USING gin (public.fastt_search_normalize(coalesce("productNameSnapshot", '')) gin_trgm_ops)
	WHERE "productNameSnapshot" IS NOT NULL;
CREATE INDEX "BookingLineItem_variantNameSnapshot_trgm_idx"
	ON "BookingLineItem" USING gin (public.fastt_search_normalize(coalesce("variantNameSnapshot", '')) gin_trgm_ops)
	WHERE "variantNameSnapshot" IS NOT NULL;



-- Canonical Phase 2 casework policy seed for fresh installs.

-- Deterministic Phase 2 policy seed for Bolivia accommodation intermediary/PSP.
-- Included in fresh installs via db:pg:generate-initial and in upgrades via the
-- Phase 2 additive migration. Keep both copies identical and idempotent.
INSERT INTO "CompliancePolicySet" ("id","key","label","country","vertical","collectionModel","status") VALUES
	('cps_bo_accommodation_intermediary_v1','bo-accommodation-intermediary','FASTT Bolivia · alojamientos · intermediario','BO','accommodation','intermediary','active')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "CompliancePolicyVersion" ("id","policySetId","version","status","effectiveFrom","approvedAt") VALUES
	('cpv_bo_accommodation_intermediary_v1','cps_bo_accommodation_intermediary_v1',1,'published','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')
ON CONFLICT ("policySetId","version") DO NOTHING;

INSERT INTO "ComplianceRequirementRule" ("id","policyVersionId","domain","requirementKey","slaHours") VALUES
	('crr_v1_identity','cpv_bo_accommodation_intermediary_v1','verification','identity_and_business_review',24),
	('crr_v1_tax','cpv_bo_accommodation_intermediary_v1','fiscal','tax_identity_review',48),
	('crr_v1_document','cpv_bo_accommodation_intermediary_v1','documents','evidence_document_review',48),
	('crr_v1_payout','cpv_bo_accommodation_intermediary_v1','payments','payout_account_review',24)
ON CONFLICT ("policyVersionId","requirementKey") DO NOTHING;

INSERT INTO "ComplianceDecisionReason" ("id","policyVersionId","code","domain","decision","label","requiresComment") VALUES
	('cdr_v1_approved','cpv_bo_accommodation_intermediary_v1','requirements_satisfied',NULL,'approved','Requisitos satisfechos',false),
	('cdr_v1_missing','cpv_bo_accommodation_intermediary_v1','evidence_missing',NULL,'request_information','Evidencia faltante',true),
	('cdr_v1_mismatch','cpv_bo_accommodation_intermediary_v1','information_mismatch',NULL,'requires_attention','Información inconsistente',true),
	('cdr_v1_rejected','cpv_bo_accommodation_intermediary_v1','requirements_not_satisfied',NULL,'rejected','Requisitos no satisfechos',true)
ON CONFLICT ("policyVersionId","code") DO NOTHING;



COMMIT;
