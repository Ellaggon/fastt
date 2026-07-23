import { randomUUID } from "node:crypto"

import "dotenv/config"

import postgres from "postgres"

type QuerySql = postgres.Sql | postgres.TransactionSql

function requireEnv(name: string): string {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`Missing required env ${name}`)
	return value
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name)
}

async function countAll(sql: QuerySql) {
	const [row] = await sql`
		select
			(select count(*) from "Product")::int as products,
			(select count(*) from "Provider")::int as providers,
			(select count(*) from "RatePlan")::int as "ratePlans",
			(select count(*) from "Variant" where "isActive" = true)::int as "activeVariants",
			(select count(*) from "ProductOperationalSurface")::int as "productSurfaces",
			(select count(*) from "ProviderConfigurationState")::int as "providerStates",
			(select count(*) from "RatePlanConditionState")::int as "conditionStates",
			(select count(*) from "FinancialProviderSummary")::int as "financialSummaries",
			(select count(*) from "SearchUnitView")::int as "searchUnits"
	`
	return row
}

async function backfillProductOperationalSurface(sql: QuerySql) {
	const rows = await sql`
		with product_base as (
			select
				p.id as "productId",
				p."providerId",
				p.name as "productName",
				p."productType",
				coalesce(ps.state, 'draft') as status,
				coalesce(v.count_all, 0)::int as "variantCount",
				coalesce(v.count_active, 0)::int as "activeVariantCount",
				coalesce(rp.default_rate_plan_ids, '[]'::jsonb) as "defaultRatePlanIdsJson",
				coalesce(img.previews, '[]'::jsonb) as "imagePreviewJson",
				img.cover as "coverImageJson",
				coalesce(
					jsonb_build_object(
						'status', prep.status,
						'statusLabel', prep."statusLabel",
						'statusVariant', prep."statusVariant",
						'isPublished', prep."isPublished",
						'readinessPercent', prep."readinessPercent",
						'blockerCount', prep."blockerCount",
						'blockerPreview', coalesce(prep."blockerPreviewJson", '[]'::jsonb),
						'readyToPublish', prep."readyToPublish",
						'continuePreparationHref', prep."continuePreparationHref",
						'previewHref', prep."previewHref",
						'nextStepLabel', prep."nextStepLabel"
					),
					jsonb_build_object(
						'status', coalesce(ps.state, 'draft'),
						'statusLabel', 'En preparación',
						'statusVariant', 'warning',
						'isPublished', coalesce(ps.state, 'draft') = 'published',
						'readinessPercent', 0,
						'blockerCount', 0,
						'blockerPreview', '[]'::jsonb,
						'readyToPublish', false,
						'continuePreparationHref', '/product/' || p.id || '/complete-to-publish',
						'previewHref', '/product/' || p.id || '/preview',
						'nextStepLabel', null
					)
				) as "readinessJson",
				case
					when h."productId" is not null then 'Hotel' || case when h.stars is not null then ' · ' || h.stars::text || ' estrellas' else '' end
					when t."productId" is not null then 'Tour' || case when nullif(t.duration, '') is not null then ' · ' || t.duration else '' end
					when pkg."productId" is not null then 'Paquete' || case when pkg.days is not null then ' · ' || pkg.days::text || ' días' else '' end
					else 'Subtipo no configurado'
				end as "subtypeSummary",
				case
					when coalesce(jsonb_array_length(coalesce(rp.default_rate_plan_ids, '[]'::jsonb)), 0) > 0
						then '/rates/plans/' || (rp.default_rate_plan_ids->>0) || '/policies'
					else '/rates'
				end as "conditionsHref",
				jsonb_build_object(
					'totalCategories', 4,
					'coveredCategories', coalesce(policy.covered_categories, 0),
					'missingCategories', coalesce(policy.missing_categories, '["Cancellation","Payment","CheckIn","NoShow"]'::jsonb),
					'isComplete', coalesce(policy.covered_categories, 0) = 4,
					'summary', case
						when coalesce(policy.covered_categories, 0) = 4 then 'Condiciones completas'
						else 'Faltan condiciones: ' || array_to_string(array(select jsonb_array_elements_text(coalesce(policy.missing_categories, '["Cancellation","Payment","CheckIn","NoShow"]'::jsonb))), ', ')
					end,
					'ratePlanId', rp.default_rate_plan_ids->>0,
					'updatedAt', now()
				) as "policyCoverageStateJson"
			from "Product" p
			left join "ProductStatus" ps on ps."productId" = p.id
			left join "ProductPreparationSnapshot" prep on prep."productId" = p.id
			left join "Hotel" h on h."productId" = p.id
			left join "Tour" t on t."productId" = p.id
			left join "Package" pkg on pkg."productId" = p.id
			left join lateral (
				select
					count(*) as count_all,
					count(*) filter (where coalesce(v."isActive", true) = true and coalesce(v.status, '') <> 'archived') as count_active
				from "Variant" v
				where v."productId" = p.id
			) v on true
			left join lateral (
				select jsonb_agg(rp.id order by rp."isDefault" desc, rp."createdAt" desc) filter (where rp.id is not null) as default_rate_plan_ids
				from "Variant" v
				join "RatePlan" rp on rp."variantId" = v.id and rp."isActive" = true
				where v."productId" = p.id and coalesce(v."isActive", true) = true
			) rp on true
			left join lateral (
				select
					jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url) order by i."isPrimary" desc, i."order" asc) filter (where i.id is not null) as previews,
					(jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url) order by i."isPrimary" desc, i."order" asc)->0) as cover
				from "Image" i
				where i."entityId" = p.id and (i."entityType" = 'product' or i."entityType" is null)
				limit 3
			) img on true
			left join lateral (
				with required(category) as (
					values ('Cancellation'), ('Payment'), ('CheckIn'), ('NoShow')
				),
				covered as (
					select distinct pa.category
					from "PolicyAssignment" pa
					where pa."isActive" = true
						and coalesce(pa.channel, 'web') = 'web'
						and pa.category in ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
						and (
							(pa.scope = 'product' and pa."scopeId" = p.id)
							or (pa.scope = 'rate_plan' and pa."scopeId" = rp.default_rate_plan_ids->>0)
						)
				)
				select
					(select count(*) from covered)::int as covered_categories,
					(select jsonb_agg(category order by category) from required where category not in (select category from covered)) as missing_categories
			) policy on true
			where p."providerId" is not null
		)
		insert into "ProductOperationalSurface" (
			"productId",
			"providerId",
			"productName",
			"productType",
			"status",
			"readinessJson",
			"subtypeSummary",
			"imagePreviewJson",
			"coverImageJson",
			"variantCount",
			"activeVariantCount",
			"defaultRatePlanIdsJson",
			"policyCoverageStateJson",
			"conditionsHref",
			"updatedAt"
		)
		select
			"productId",
			"providerId",
			"productName",
			"productType",
			status,
			"readinessJson",
			"subtypeSummary",
			"imagePreviewJson",
			"coverImageJson",
			"variantCount",
			"activeVariantCount",
			"defaultRatePlanIdsJson",
			"policyCoverageStateJson",
			"conditionsHref",
			now()
		from product_base
		on conflict ("productId") do update set
			"providerId" = excluded."providerId",
			"productName" = excluded."productName",
			"productType" = excluded."productType",
			"status" = excluded."status",
			"readinessJson" = excluded."readinessJson",
			"subtypeSummary" = excluded."subtypeSummary",
			"imagePreviewJson" = excluded."imagePreviewJson",
			"coverImageJson" = excluded."coverImageJson",
			"variantCount" = excluded."variantCount",
			"activeVariantCount" = excluded."activeVariantCount",
			"defaultRatePlanIdsJson" = excluded."defaultRatePlanIdsJson",
			"policyCoverageStateJson" = excluded."policyCoverageStateJson",
			"conditionsHref" = excluded."conditionsHref",
			"updatedAt" = now()
		returning "productId"
	`
	return rows.length
}

async function backfillRatePlanConditionState(sql: QuerySql) {
	const rows = await sql`
		with required(category) as (
			values ('Cancellation'), ('Payment'), ('CheckIn'), ('NoShow')
		),
		contexts as (
			select
				rp.id as "ratePlanId",
				p."providerId",
				p.id as "productId",
				v.id as "variantId"
			from "RatePlan" rp
			join "Variant" v on v.id = rp."variantId"
			join "Product" p on p.id = v."productId"
			where rp."isActive" = true and coalesce(v."isActive", true) = true and p."providerId" is not null
		),
		coverage as (
			select
				c.*,
				coalesce(jsonb_agg(distinct pa.category) filter (where pa.category is not null), '[]'::jsonb) as covered
			from contexts c
			left join "PolicyAssignment" pa on pa."isActive" = true
				and coalesce(pa.channel, 'web') = 'web'
				and pa.category in ('Cancellation', 'Payment', 'CheckIn', 'NoShow')
				and (
					(pa.scope = 'rate_plan' and pa."scopeId" = c."ratePlanId")
					or (pa.scope = 'variant' and pa."scopeId" = c."variantId")
					or (pa.scope = 'product' and pa."scopeId" = c."productId")
				)
			group by c."ratePlanId", c."providerId", c."productId", c."variantId"
		),
		summary as (
			select
				c.*,
				(select count(*)::int from jsonb_array_elements_text(c.covered)) as covered_count,
				(select coalesce(jsonb_agg(category order by category), '[]'::jsonb) from required where category not in (select value from jsonb_array_elements_text(c.covered))) as missing
			from coverage c
		)
		insert into "RatePlanConditionState" (
			id,
			"ratePlanId",
			"providerId",
			"productId",
			"variantId",
			channel,
			"totalCategories",
			"coveredCategories",
			"missingCategoriesJson",
			"conditionsComplete",
			summary,
			"policyCoverageUpdatedAt",
			"updatedAt"
		)
		select
			"ratePlanId" || ':web',
			"ratePlanId",
			"providerId",
			"productId",
			"variantId",
			'web',
			4,
			covered_count,
			missing,
			covered_count = 4,
			case
				when covered_count = 4 then 'Condiciones completas'
				else 'Faltan condiciones: ' || array_to_string(array(select jsonb_array_elements_text(missing)), ', ')
			end,
			now(),
			now()
		from summary
		on conflict ("ratePlanId", channel) do update set
			"providerId" = excluded."providerId",
			"productId" = excluded."productId",
			"variantId" = excluded."variantId",
			"totalCategories" = excluded."totalCategories",
			"coveredCategories" = excluded."coveredCategories",
			"missingCategoriesJson" = excluded."missingCategoriesJson",
			"conditionsComplete" = excluded."conditionsComplete",
			summary = excluded.summary,
			"policyCoverageUpdatedAt" = now(),
			"updatedAt" = now()
		returning "ratePlanId"
	`
	return rows.length
}

async function backfillProviderConfigurationState(sql: QuerySql) {
	const rows = await sql`
		with provider_base as (
			select
				p.id as "providerId",
				(p."displayName" is not null and p."legalName" is not null) as identity_complete,
				(pp.timezone is not null and pp."defaultCurrency" is not null and pp."supportEmail" is not null) as operations_complete,
				exists (
					select 1 from "ProviderVerification" pv
					where pv."providerId" = p.id and pv.status = 'approved'
				) as verification_complete,
				coalesce(doc.documents, 0)::int as documents,
				coalesce(doc.verified_documents, 0)::int as verified_documents,
				coalesce(pay.payment_accounts, 0)::int as payment_accounts,
				coalesce(pay.verified_payment_accounts, 0)::int as verified_payment_accounts,
				coalesce(integ.integrations, 0)::int as integrations,
				coalesce(integ.connected_integrations, 0)::int as connected_integrations,
				coalesce(audit.audit_events, 0)::int as audit_events,
				coalesce(team.team_members, 0)::int as team_members,
				exists (
					select 1 from "ProviderTaxConfiguration" ptc
					where ptc."providerId" = p.id and ptc.status = 'verified'
				) as fiscal_complete
			from "Provider" p
			left join "ProviderProfile" pp on pp."providerId" = p.id
			left join lateral (
				select
					count(*) as documents,
					count(*) filter (where status = 'verified') as verified_documents
				from "ProviderDocument"
				where "providerId" = p.id
			) doc on true
			left join lateral (
				select
					count(*) as payment_accounts,
					count(*) filter (where status = 'verified') as verified_payment_accounts
				from "ProviderPaymentAccount"
				where "providerId" = p.id
			) pay on true
			left join lateral (
				select
					count(*) as integrations,
					count(*) filter (where status = 'connected' and lower(coalesce("lastSyncStatus", '')) in ('success', 'ok')) as connected_integrations
				from "ProviderIntegrationConnection"
				where "providerId" = p.id
			) integ on true
			left join lateral (
				select count(*) as audit_events
				from "ProviderAuditLog"
				where "providerId" = p.id
			) audit on true
			left join lateral (
				select count(*) as team_members
				from "ProviderUser"
				where "providerId" = p.id
			) team on true
		),
		readiness as (
			select
				*,
				jsonb_build_array(
					jsonb_build_object('id','identity','label','Identidad comercial completa','complete',identity_complete,'href','/provider/settings/profile','capabilities',jsonb_build_array('publish','booking','payments','integrations')),
					jsonb_build_object('id','operations','label','Perfil operativo completo','complete',operations_complete,'href','/provider/settings/profile','capabilities',jsonb_build_array('publish','booking')),
					jsonb_build_object('id','verification','label','Proveedor aprobado por cumplimiento','complete',verification_complete,'href','/provider/settings/verification','capabilities',jsonb_build_array('publish','booking','payments','integrations')),
					jsonb_build_object('id','documents','label','Documentos KYC verificados','complete',verified_documents > 0,'href','/provider/settings/verification','capabilities',jsonb_build_array('payments','integrations')),
					jsonb_build_object('id','fiscality','label','Identidad fiscal verificada','complete',fiscal_complete,'href','/provider/settings/tax-fees','capabilities',jsonb_build_array('publish','booking','payments')),
					jsonb_build_object('id','payments','label','Cuenta de pago verificada','complete',verified_payment_accounts > 0,'href','/provider/settings/payments','capabilities',jsonb_build_array('payments')),
					jsonb_build_object('id','integrations','label','Integraciones con prueba de sync exitosa','complete',connected_integrations > 0,'href','/provider/settings/integrations','capabilities',jsonb_build_array('integrations')),
					jsonb_build_object('id','team','label','Propietario y permisos base','complete',team_members > 0,'href','/provider/settings/team','capabilities',jsonb_build_array('publish','booking','payments','integrations'))
				) as readiness_json
			from provider_base
		),
		summary as (
			select
				*,
				(select count(*)::int from jsonb_array_elements(readiness_json) item where (item->>'complete')::boolean) as completed,
				8 as total
			from readiness
		)
		insert into "ProviderConfigurationState" (
			"providerId",
			"canPublish",
			"canAcceptBookings",
			"canCollectPayments",
			"canUseIntegrations",
			"readinessPercent",
			"readinessJson",
			"countsJson",
			"blockersJson",
			"risksJson",
			"updatedAt"
		)
		select
			"providerId",
			identity_complete and operations_complete and verification_complete and fiscal_complete and team_members > 0,
			identity_complete and operations_complete and verification_complete and fiscal_complete and team_members > 0,
			identity_complete and verification_complete and fiscal_complete and verified_documents > 0 and verified_payment_accounts > 0 and team_members > 0,
			identity_complete and verification_complete and verified_documents > 0 and connected_integrations > 0 and team_members > 0,
			round((completed::numeric / total::numeric) * 100)::int,
			readiness_json,
			jsonb_build_object(
				'documents', documents,
				'verifiedDocuments', verified_documents,
				'paymentAccounts', payment_accounts,
				'verifiedPaymentAccounts', verified_payment_accounts,
				'integrations', integrations,
				'connectedIntegrations', connected_integrations,
				'auditEvents', audit_events,
				'teamMembers', team_members
			),
			coalesce((select jsonb_agg(jsonb_build_object(
				'id', item->>'id',
				'label', item->>'label',
				'severity', case when item->>'id' in ('identity','operations','verification','fiscality','team') then 'high' else 'medium' end,
				'href', item->>'href',
				'capabilities', item->'capabilities'
			)) from jsonb_array_elements(readiness_json) item where not (item->>'complete')::boolean and item->>'id' <> 'integrations'), '[]'::jsonb),
			case when connected_integrations = 0 then jsonb_build_array(jsonb_build_object(
				'id','integrations_not_ready',
				'label','No hay integraciones con smoke test exitoso',
				'severity','low',
				'href','/provider/settings/integrations',
				'capabilities',jsonb_build_array('integrations')
			)) else '[]'::jsonb end,
			now()
		from summary
		on conflict ("providerId") do update set
			"canPublish" = excluded."canPublish",
			"canAcceptBookings" = excluded."canAcceptBookings",
			"canCollectPayments" = excluded."canCollectPayments",
			"canUseIntegrations" = excluded."canUseIntegrations",
			"readinessPercent" = excluded."readinessPercent",
			"readinessJson" = excluded."readinessJson",
			"countsJson" = excluded."countsJson",
			"blockersJson" = excluded."blockersJson",
			"risksJson" = excluded."risksJson",
			"updatedAt" = now()
		returning "providerId"
	`
	return rows.length
}

async function backfillFinancialProviderSummary(sql: QuerySql) {
	const rows = await sql`
		with computed as (
			select
				p.id as "providerId",
				jsonb_build_object(
					'count', coalesce(pt.count, 0),
					'amount', coalesce(pt.amount, 0),
					'currency', pt.currency,
					'lastAt', pt.last_at,
					'captures', coalesce(pt.captures, 0),
					'refunds', coalesce(pt.refunds, 0),
					'failed', coalesce(pt.failed, 0)
				) as collections,
				jsonb_build_object(
					'count', coalesce(ref.count, 0),
					'amount', coalesce(ref.amount, 0),
					'currency', ref.currency,
					'lastAt', ref.last_at,
					'recorded', coalesce(ref.recorded, 0),
					'pending', coalesce(ref.pending, 0),
					'failed', coalesce(ref.failed, 0)
				) as refunds,
				jsonb_build_object(
					'total', coalesce(exc.total, 0),
					'open', coalesce(exc.open, 0),
					'acknowledged', coalesce(exc.acknowledged, 0),
					'resolved', coalesce(exc.resolved, 0),
					'dismissed', coalesce(exc.dismissed, 0),
					'lastOpenedAt', exc.last_opened_at
				) as exceptions,
				jsonb_build_object(
					'count', coalesce(sett.count, 0),
					'amount', coalesce(sett.amount, 0),
					'currency', sett.currency,
					'lastAt', sett.last_at,
					'recorded', coalesce(sett.recorded, 0),
					'unmatched', coalesce(sett.unmatched, 0)
				) as settlements
			from "Provider" p
			left join lateral (
				select
					count(*)::int as count,
					coalesce(sum(amount), 0)::numeric as amount,
					max(currency) as currency,
					max("occurredAt") as last_at,
					count(*) filter (where type = 'capture')::int as captures,
					count(*) filter (where type = 'refund')::int as refunds,
					count(*) filter (where status = 'failed')::int as failed
				from "PaymentTransaction"
				where "providerId" = p.id
			) pt on true
			left join lateral (
				select
					count(*)::int as count,
					coalesce(sum("refundAmount"), 0)::numeric as amount,
					max(currency) as currency,
					max("appliedAt") as last_at,
					count(*) filter (where status in ('recorded', 'applied'))::int as recorded,
					count(*) filter (where status in ('pending', 'created'))::int as pending,
					count(*) filter (where status = 'failed')::int as failed
				from "RefundLedger"
				where "providerId" = p.id
			) ref on true
			left join lateral (
				select
					count(*)::int as total,
					count(*) filter (where status = 'open')::int as open,
					count(*) filter (where status = 'acknowledged')::int as acknowledged,
					count(*) filter (where status = 'resolved')::int as resolved,
					count(*) filter (where status = 'dismissed')::int as dismissed,
					max("openedAt") as last_opened_at
				from "FinancialExceptionRecord"
				where "providerId" = p.id
			) exc on true
			left join lateral (
				select
					count(*)::int as count,
					coalesce(sum(amount), 0)::numeric as amount,
					max(currency) as currency,
					max("settlementDate") as last_at,
					count(*) filter (where "bookingId" not like 'unmatched:%')::int as recorded,
					count(*) filter (where "bookingId" like 'unmatched:%')::int as unmatched
				from "FinancialSettlementRecord"
				where "providerId" = p.id
			) sett on true
		)
		insert into "FinancialProviderSummary" (
			"providerId",
			"summaryJson",
			"collectionsJson",
			"refundsJson",
			"exceptionsJson",
			"settlementsJson",
			"computedAt",
			"invalidatedAt",
			"invalidationReason",
			"createdAt",
			"updatedAt"
		)
		select
			"providerId",
			jsonb_build_object('collections', collections, 'refunds', refunds, 'exceptions', exceptions, 'settlements', settlements),
			collections,
			refunds,
			exceptions,
			settlements,
			now(),
			null,
			'backfill-performance-surfaces',
			now(),
			now()
		from computed
		on conflict ("providerId") do update set
			"summaryJson" = excluded."summaryJson",
			"collectionsJson" = excluded."collectionsJson",
			"refundsJson" = excluded."refundsJson",
			"exceptionsJson" = excluded."exceptionsJson",
			"settlementsJson" = excluded."settlementsJson",
			"computedAt" = now(),
			"invalidatedAt" = null,
			"invalidationReason" = excluded."invalidationReason",
			"updatedAt" = now()
		returning "providerId"
	`
	return rows.length
}

async function searchFreshness(sql: QuerySql) {
	const [row] = await sql`
		select
			count(*)::int as rows,
			count(distinct "variantId")::int as variants,
			min(date)::text as "minDate",
			max(date)::text as "maxDate",
			max("computedAt") as "lastComputedAt",
			count(*) filter (where "computedAt" < now() - interval '24 hours')::int as "olderThan24h"
		from "SearchUnitView"
	`
	return row
}

async function backfillEffectivePricingV2(sql: QuerySql, horizonDays: number) {
	const rows = await sql`
		with dates as (
			select generate_series(
				current_date,
				current_date + ((${horizonDays}::int - 1) * interval '1 day'),
				interval '1 day'
			)::date as date
		),
		occupancies("occupancyKey", adults, children, infants) as (
			values
				('a1_c0_i0', 1, 0, 0),
				('a2_c0_i0', 2, 0, 0),
				('a2_c1_i0', 2, 1, 0),
				('a3_c0_i0', 3, 0, 0)
		),
		active_context as (
			select
				v.id as "variantId",
				rp.id as "ratePlanId",
				d.date,
				o."occupancyKey",
				o.adults,
				o.children,
				policy."baseAmount"::numeric as "baseAmount",
				coalesce(nullif(policy.currency, ''), nullif(policy."baseCurrency", ''), 'USD') as currency,
				greatest(coalesce(policy."baseAdults", o.adults), 1)::int as "baseAdults",
				greatest(coalesce(policy."baseChildren", 0), 0)::int as "baseChildren",
				coalesce(nullif(policy."extraAdultMode", ''), 'fixed') as "extraAdultMode",
				coalesce(policy."extraAdultValue", 0)::numeric as "extraAdultValue",
				coalesce(nullif(policy."childMode", ''), 'fixed') as "childMode",
				coalesce(policy."childValue", 0)::numeric as "childValue"
			from "Variant" v
			join "Product" p on p.id = v."productId"
			join "RatePlan" rp on rp."variantId" = v.id
			cross join dates d
			cross join occupancies o
			join lateral (
				select pol.*
				from "RatePlanOccupancyPolicy" pol
				where pol."ratePlanId" = rp.id
					and pol."effectiveFrom" <= d.date
					and (
						pol."effectiveTo" is null
						or pol."effectiveTo" > d.date
					)
				order by pol."effectiveFrom" desc, pol.id desc
				limit 1
			) policy on true
			where coalesce(v."isActive", true) = true
				and coalesce(rp."isActive", true) = true
				and p."providerId" is not null
		),
		priced as (
			select
				'epv2_' || md5(
					"variantId" || ':' || "ratePlanId" || ':' || date::text || ':' || "occupancyKey"
				) as id,
				"variantId",
				"ratePlanId",
				date,
				"occupancyKey",
				round(greatest("baseAmount", 0), 2) as "baseComponent",
				round(
					greatest(
						case
							when "extraAdultMode" = 'percentage'
								then ("baseAmount" * abs("extraAdultValue") * greatest(adults - "baseAdults", 0)) / 100
							else abs("extraAdultValue") * greatest(adults - "baseAdults", 0)
						end
						+
						case
							when "childMode" = 'percentage'
								then ("baseAmount" * abs("childValue") * greatest(children - "baseChildren", 0)) / 100
							else abs("childValue") * greatest(children - "baseChildren", 0)
						end,
						0
					),
					2
				) as "occupancyAdjustment",
				0::numeric as "ruleAdjustment",
				currency
			from active_context
		)
		insert into "EffectivePricingV2" (
			id,
			"variantId",
			"ratePlanId",
			date,
			"occupancyKey",
			"baseComponent",
			"occupancyAdjustment",
			"ruleAdjustment",
			"finalBasePrice",
			currency,
			"computedAt",
			"sourceVersion"
		)
		select
			id,
			"variantId",
			"ratePlanId",
			date,
			"occupancyKey",
			"baseComponent",
			"occupancyAdjustment",
			"ruleAdjustment",
			round("baseComponent" + "occupancyAdjustment" + "ruleAdjustment", 2),
			currency,
			now(),
			'postgres-pricing-backfill-v1'
		from priced
		on conflict ("variantId", "ratePlanId", date, "occupancyKey") do update set
			"baseComponent" = excluded."baseComponent",
			"occupancyAdjustment" = excluded."occupancyAdjustment",
			"ruleAdjustment" = excluded."ruleAdjustment",
			"finalBasePrice" = excluded."finalBasePrice",
			currency = excluded.currency,
			"computedAt" = excluded."computedAt",
			"sourceVersion" = excluded."sourceVersion"
		returning id
	`
	return rows.length
}

async function backfillSearchUnitView(sql: QuerySql, horizonDays: number) {
	const rows = await sql`
		with source_rows as (
			select
				ep."variantId",
				v."productId",
				ep."ratePlanId",
				ep.date,
				ep."occupancyKey",
				coalesce(
					nullif(substring(ep."occupancyKey" from 'a([0-9]+)'), '')::int,
					1
				)
				+
				coalesce(
					nullif(substring(ep."occupancyKey" from 'c([0-9]+)'), '')::int,
					0
				) as "totalGuests",
				ea.id is not null as "hasAvailability",
				ep."finalBasePrice" is not null as "hasPrice",
				greatest(coalesce(ea."availableUnits", 0), 0)::int as "availableUnits",
				ep."finalBasePrice" as "pricePerNight",
				ep.currency,
				coalesce(er."minStay", legacy_er."minStay") as "minStay",
				coalesce(er."maxStay", legacy_er."maxStay") as "maxStay",
				coalesce(er."minLeadTime", legacy_er."minLeadTime") as "minLeadTime",
				coalesce(er."maxLeadTime", legacy_er."maxLeadTime") as "maxLeadTime",
				coalesce(er.cta, legacy_er.cta, false) as cta,
				coalesce(er.ctd, legacy_er.ctd, false) as ctd,
				coalesce(er."stopSell", legacy_er."stopSell", false) as "stopSell"
			from "EffectivePricingV2" ep
			join "Variant" v on v.id = ep."variantId"
			join "Product" p on p.id = v."productId"
			join "RatePlan" rp on rp.id = ep."ratePlanId"
			left join "EffectiveAvailability" ea
				on ea."variantId" = ep."variantId"
				and ea.date = ep.date
			left join "EffectiveRestriction" er
				on er."variantId" = ep."variantId"
				and er."ratePlanId" = ep."ratePlanId"
				and er.date = ep.date
			left join "EffectiveRestriction" legacy_er
				on legacy_er."variantId" = ep."variantId"
				and legacy_er."ratePlanId" is null
				and legacy_er.date = ep.date
			where coalesce(v."isActive", true) = true
				and coalesce(rp."isActive", true) = true
				and p."providerId" is not null
				and ep.date >= current_date
				and ep.date < current_date + (${horizonDays}::int * interval '1 day')
		),
		candidates as (
			select
				'suv_' || md5(
					"variantId" || ':' || "ratePlanId" || ':' || date::text || ':' || "occupancyKey"
				) as id,
				"variantId",
				"productId",
				"ratePlanId",
				date,
				"occupancyKey",
				"totalGuests",
				"hasAvailability",
				"hasPrice",
				(
					"hasAvailability"
					and "hasPrice"
					and not "stopSell"
					and "availableUnits" > 0
				) as "isAvailable",
				"availableUnits",
				"pricePerNight",
				currency,
				case
					when not "hasAvailability" then 'MISSING_COVERAGE'
					when "stopSell" then 'STOP_SELL'
					when "availableUnits" <= 0 then 'NO_CAPACITY'
					when not "hasPrice" then 'MISSING_PRICE'
					else null
				end as "primaryBlocker",
				"minStay",
				"maxStay",
				"minLeadTime",
				"maxLeadTime",
				cta,
				ctd,
				now() as "computedAt",
				'postgres-search-backfill-v1' as "sourceVersion"
			from source_rows
		)
		insert into "SearchUnitView" (
			id,
			"variantId",
			"productId",
			"ratePlanId",
			date,
			"occupancyKey",
			"totalGuests",
			"hasAvailability",
			"hasPrice",
			"isAvailable",
			"availableUnits",
			"pricePerNight",
			currency,
			"primaryBlocker",
			"minStay",
			"maxStay",
			"minLeadTime",
			"maxLeadTime",
			cta,
			ctd,
			"computedAt",
			"sourceVersion"
		)
		select
			id,
			"variantId",
			"productId",
			"ratePlanId",
			date,
			"occupancyKey",
			"totalGuests",
			"hasAvailability",
			"hasPrice",
			"isAvailable",
			"availableUnits",
			"pricePerNight",
			currency,
			"primaryBlocker",
			"minStay",
			"maxStay",
			"minLeadTime",
			"maxLeadTime",
			cta,
			ctd,
			"computedAt",
			"sourceVersion"
		from candidates
		on conflict ("variantId", "ratePlanId", date, "occupancyKey") do update set
			"productId" = excluded."productId",
			"totalGuests" = excluded."totalGuests",
			"hasAvailability" = excluded."hasAvailability",
			"hasPrice" = excluded."hasPrice",
			"isAvailable" = excluded."isAvailable",
			"availableUnits" = excluded."availableUnits",
			"pricePerNight" = excluded."pricePerNight",
			currency = excluded.currency,
			"primaryBlocker" = excluded."primaryBlocker",
			"minStay" = excluded."minStay",
			"maxStay" = excluded."maxStay",
			"minLeadTime" = excluded."minLeadTime",
			"maxLeadTime" = excluded."maxLeadTime",
			cta = excluded.cta,
			ctd = excluded.ctd,
			"computedAt" = excluded."computedAt",
			"sourceVersion" = excluded."sourceVersion"
		returning id
	`
	return rows.length
}

async function recordSearchMaterializationLog(
	sql: QuerySql,
	params: {
		runId: string
		status: "completed" | "failed"
		horizonDays: number
		rowsMaterialized: number
		durationMs: number
		errorMessage?: string | null
		startedAt: Date
	}
) {
	await sql`
		insert into "SearchMaterializationLog" (
			id,
			"runId",
			trigger,
			status,
			"fromDate",
			"toDate",
			"horizonDays",
			currency,
			"variantsScanned",
			"rowsMaterialized",
			"purgedRows",
			"durationMs",
			"errorMessage",
			"metadataJson",
			"startedAt",
			"finishedAt",
			"createdAt"
		)
		values (
			${params.runId},
			${params.runId},
			'db_backfill_performance_surfaces',
			${params.status},
			current_date,
			current_date + (${params.horizonDays}::int * interval '1 day'),
			${params.horizonDays},
			'USD',
			(select count(*) from "Variant" where "isActive" = true),
			${params.rowsMaterialized},
			0,
			${Math.round(params.durationMs)},
			${params.errorMessage ?? null},
			jsonb_build_object(
				'source', 'scripts/db/backfill-performance-surfaces.ts',
				'effectivePricingV2Backfilled', true
			),
			${params.startedAt},
			now(),
			now()
		)
		on conflict ("runId") do update set
			status = excluded.status,
			"rowsMaterialized" = excluded."rowsMaterialized",
			"durationMs" = excluded."durationMs",
			"errorMessage" = excluded."errorMessage",
			"metadataJson" = excluded."metadataJson",
			"finishedAt" = excluded."finishedAt"
	`
}

async function main() {
	const dryRun = hasFlag("--dry-run") || process.env.FASTT_BACKFILL_DRY_RUN === "1"
	const horizonDays = Math.max(1, Number(process.env.FASTT_SEARCH_BACKFILL_DAYS ?? 30))
	const startedAt = performance.now()
	const startedAtDate = new Date()
	const runId = `search_mat_backfill_${startedAtDate.toISOString()}_${randomUUID()}`
	const db = postgres(requireEnv("DIRECT_URL"), {
		max: 1,
		prepare: false,
		idle_timeout: 5,
		connect_timeout: 15,
	})

	try {
		const before = await countAll(db)
		const beforeSearch = await searchFreshness(db)
		const result = dryRun
			? {
					productOperationalSurface: 0,
					ratePlanConditionState: 0,
					providerConfigurationState: 0,
					financialProviderSummary: 0,
					effectivePricingV2: 0,
					searchUnitView: 0,
				}
			: await db.begin(async (sql) => ({
					ratePlanConditionState: await backfillRatePlanConditionState(sql),
					productOperationalSurface: await backfillProductOperationalSurface(sql),
					providerConfigurationState: await backfillProviderConfigurationState(sql),
					financialProviderSummary: await backfillFinancialProviderSummary(sql),
					effectivePricingV2: await backfillEffectivePricingV2(sql, horizonDays),
					searchUnitView: await backfillSearchUnitView(sql, horizonDays),
				}))
		const after = await countAll(db)
		const afterSearch = await searchFreshness(db)
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		if (!dryRun) {
			await recordSearchMaterializationLog(db, {
				runId,
				status: "completed",
				horizonDays,
				rowsMaterialized: Number(result.searchUnitView ?? 0),
				durationMs,
				startedAt: startedAtDate,
			})
		}
		console.log(
			JSON.stringify(
				{
					ok: true,
					dryRun,
					runId: dryRun ? null : runId,
					durationMs,
					searchBackfillDays: horizonDays,
					before,
					result,
					after,
					search: {
						before: beforeSearch,
						after: afterSearch,
						note: "SearchUnitView refresh uses current EffectivePricingV2 rows for the configured horizon and preserves older/out-of-horizon rows.",
					},
				},
				null,
				2
			)
		)
	} finally {
		await db.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
