import {
	collectionModelForIdentitySave,
	parseHolderDeclaration,
	readProviderHolderProfile,
	saveProviderHolderProfile,
} from "@/lib/provider-holder-profile"
import { mapZodError } from "@/lib/validation/mapZodError"
import { type ProviderV2RepositoryPort, updateProviderIdentityV2 } from "@/modules/catalog/public"
import { providerIdentitySchema, providerProfileSchema } from "@/schemas/provider"

export function formIncludesIdentityFields(form: FormData) {
	return form.has("displayName") || form.has("legalName")
}

export function readProviderSettingsFormValues(form: FormData) {
	return {
		displayName: String(form.get("displayName") ?? "").trim(),
		legalName: String(form.get("legalName") ?? "").trim(),
		holderType: String(form.get("holderType") ?? "").trim(),
		holderCountry: String(form.get("holderCountry") ?? "").trim(),
		taxResidenceCountry: String(form.get("taxResidenceCountry") ?? "").trim(),
		payoutCountry: String(form.get("payoutCountry") ?? "").trim(),
		timezone: String(form.get("timezone") ?? "").trim(),
		defaultCurrency: String(form.get("defaultCurrency") ?? "").trim(),
		supportEmail: String(form.get("supportEmail") ?? "").trim(),
		supportPhone: String(form.get("supportPhone") ?? "").trim(),
	}
}

export function validateProviderSettingsForm(
	form: FormData,
	options: { includeIdentity: boolean }
): Record<string, string> {
	const errors: Record<string, string> = {}
	const values = readProviderSettingsFormValues(form)

	if (options.includeIdentity) {
		const identity = providerIdentitySchema.safeParse({
			displayName: values.displayName,
			legalName: values.legalName,
		})
		if (!identity.success) Object.assign(errors, mapZodError(identity.error))
		if (form.has("holderType") || form.has("holderCountry")) {
			try {
				parseHolderDeclaration(form)
			} catch {
				errors.holderType ??= "Selecciona quién operará el negocio."
				errors.holderCountry ??= "Usa un código de país de dos letras, por ejemplo BO."
			}
		}
	}

	const profile = providerProfileSchema.safeParse({
		timezone: values.timezone,
		defaultCurrency: values.defaultCurrency,
		supportEmail: values.supportEmail,
		supportPhone: values.supportPhone || undefined,
	})
	if (!profile.success) Object.assign(errors, mapZodError(profile.error))
	return errors
}

export async function persistProviderIdentityFromForm(params: {
	repo: ProviderV2RepositoryPort
	providerId: string
	userId: string
	form: FormData
}) {
	const values = readProviderSettingsFormValues(params.form)
	await updateProviderIdentityV2(
		{ repo: params.repo },
		{
			providerId: params.providerId,
			displayName: values.displayName,
			legalName: values.legalName,
		}
	)
	const holderDeclaration = parseHolderDeclaration(params.form)
	if (!holderDeclaration) return
	const existingHolder = await readProviderHolderProfile(params.providerId)
	await saveProviderHolderProfile({
		providerId: params.providerId,
		userId: params.userId,
		declaration: {
			...holderDeclaration,
			collectionModel: collectionModelForIdentitySave(existingHolder),
		},
	})
}
