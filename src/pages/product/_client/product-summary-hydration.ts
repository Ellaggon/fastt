import {
	resolveProductPreparationCoach,
	resolveProductPreparationHeaderSummary,
	resolveProductPreparationHeaderTitle,
} from "@/lib/playbook/product-preparation-coach"

type ProductSummaryConfig = {
	productId: string
	isHotel: boolean
	isTour: boolean
	isPackage: boolean
	singularLabel: string
	workspaceSingularLabel: string
	previewHref: string
}

type ProductPreparationCheck = {
	sectionKey?: string
	complete?: boolean
	detail?: string
	statusLabel?: string
}

function bool(value: string | undefined): boolean {
	return value === "true"
}

function configFromRoot(root: HTMLElement): ProductSummaryConfig {
	return {
		productId: root.dataset.productId || "",
		isHotel: bool(root.dataset.isHotel),
		isTour: bool(root.dataset.isTour),
		isPackage: bool(root.dataset.isPackage),
		singularLabel: root.dataset.singularLabel || "producto",
		workspaceSingularLabel: root.dataset.workspaceSingularLabel || "oferta",
		previewHref: root.dataset.previewHref || "",
	}
}

const BADGE_VARIANT_CLASS = {
	neutral:
		"inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700",
	success:
		"inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800",
	warning:
		"inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900",
	info: "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800",
} as const

const STAY_PREP_ROW_KEYS = new Set(["variants", "conditions", "houseRules"])

function setStayPreparationRowVisual(key: string, complete: boolean): void {
	if (!STAY_PREP_ROW_KEYS.has(key)) return
	const row = document.querySelector<HTMLElement>(`[data-stay-prep-row="${key}"]`)
	const iconWell = row?.querySelector<HTMLElement>("[data-stay-prep-icon-well]")
	if (!row || !iconWell) return
	row.classList.remove("fastt-row-card-alert", "fastt-row-card-info")
	if (complete) {
		iconWell.className =
			"flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
		return
	}
	row.classList.add("fastt-row-card-alert")
	iconWell.className =
		"flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800"
}

function setBadgeState(key: string, complete: boolean, label?: string): void {
	const badgeElement = document.getElementById(`blockBadge-${key}`)
	if (!badgeElement) return
	setStayPreparationRowVisual(key, complete)
	badgeElement.textContent = label || (complete ? "Completo" : "Pendiente")
	badgeElement.className = complete ? BADGE_VARIANT_CLASS.success : BADGE_VARIANT_CLASS.warning
}

function setText(id: string, value: string): void {
	const element = document.getElementById(id)
	if (element) element.textContent = value
}

function setTextSelector(selector: string, value: string): void {
	const element = document.querySelector(selector)
	if (element) element.textContent = value
}

function setPreparationBadge(ready: boolean, label: string): void {
	const badgeElement = document.querySelector<HTMLElement>("[data-product-prep-badge]")
	if (!badgeElement) return
	badgeElement.className = ready
		? "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
		: "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold border-amber-300/30 bg-amber-400/10 text-amber-100"
	badgeElement.textContent = label
}

function hydratePreparationCard(
	config: ProductSummaryConfig,
	payload: {
		preparation?: {
			readinessPercent?: number
			blockerCount?: number
			readyToPublish?: boolean
			continuePreparationHref?: string
			previewHref?: string
			nextStepLabel?: string | null
			nextStepBody?: string | null
			nextStepCta?: string | null
			completedChecks?: number | null
			totalChecks?: number | null
			checks?: ProductPreparationCheck[]
		} | null
		progress?: {
			completedSteps?: number
			totalSteps?: number
			progressPercent?: number
		}
	}
): void {
	const preparation = payload.preparation ?? null
	if (!document.querySelector("[data-product-preparation]")) return

	const percent = Number(preparation?.readinessPercent ?? payload.progress?.progressPercent ?? 0)
	const completed = Number(preparation?.completedChecks ?? 0)
	const total = Number(preparation?.totalChecks ?? 0)
	const progressBar = document.querySelector<HTMLElement>("[data-product-progress-bar]")
	if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`
	if (total > 0) {
		setTextSelector("[data-product-progress-label]", `${completed} de ${total}`)
	}

	if (!preparation) return

	const coach = resolveProductPreparationCoach({
		readyToPublish: Boolean(preparation.readyToPublish),
		readinessPercent: percent,
		nextStepLabel: preparation.nextStepLabel,
		nextStepBody: preparation.nextStepBody,
		nextStepCta: preparation.nextStepCta,
		continuePreparationHref: String(preparation.continuePreparationHref || ""),
		previewHref: String(preparation.previewHref || config.previewHref),
	})
	setPreparationBadge(coach.ready, coach.badge)
	setTextSelector("[data-product-next-step-label]", coach.label)
	setTextSelector("[data-product-next-step-body]", coach.body)
	const cta = document.querySelector<HTMLAnchorElement>("[data-product-primary-cta]")
	if (cta && coach.href) cta.setAttribute("href", coach.href)
	const ctaLabel = document.querySelector("[data-product-primary-cta-label]")
	if (ctaLabel) ctaLabel.textContent = coach.cta
}

let activeProductSummaryRequest: AbortController | null = null

export function initProductSummaryHydration(): void {
	const configRoot = document.querySelector<HTMLElement>("[data-product-summary-config]")
	if (!configRoot) {
		activeProductSummaryRequest?.abort()
		return
	}
	if (configRoot.dataset.hydrationReady === "true") return
	configRoot.dataset.hydrationReady = "true"
	const config = configFromRoot(configRoot)
	if (!config.productId) return

	const shellStart = performance.now()
	const logShellVisible = () => {
		console.debug("shell visible", {
			page: "product-surface",
			durationMs: Number((performance.now() - shellStart).toFixed(1)),
		})
	}
	if (document.readyState === "complete" || document.readyState === "interactive") logShellVisible()
	else document.addEventListener("DOMContentLoaded", logShellVisible, { once: true })

	activeProductSummaryRequest?.abort()
	const controller = new AbortController()
	activeProductSummaryRequest = controller
	const hydrationStart = performance.now()
	fetch(`/api/internal/product-summary?productId=${encodeURIComponent(config.productId)}`, {
		headers: { accept: "application/json" },
		cache: "no-store",
		signal: controller.signal,
	})
		.then(async (response) => {
			if (!response.ok) throw new Error(`summary_${response.status}`)
			return await response.json()
		})
		.then((payload) => {
			if (controller.signal.aborted) return
			if (String(payload?.productId || "") && String(payload.productId) !== config.productId) {
				return
			}
			const address = String(payload?.location?.address || "Ubicación pendiente")
			const subtypeSummary = String(payload?.subtype?.summary || "Características pendientes")
			const subtypeDetails = payload?.subtype?.details || {}
			const highlightsCount = Number(payload?.content?.highlightsCount ?? 0)
			const preparationChecks: ProductPreparationCheck[] = Array.isArray(
				payload?.preparation?.checks
			)
				? (payload.preparation.checks as ProductPreparationCheck[])
				: []
			const checkFor = (sectionKey: string) =>
				preparationChecks.find((check) => check?.sectionKey === sectionKey) ?? null
			const applyCheck = (badgeKey: string, sectionKey: string, fallbackComplete: boolean) => {
				const check = checkFor(sectionKey)
				setBadgeState(
					badgeKey,
					check ? Boolean(check.complete) : fallbackComplete,
					check?.statusLabel
				)
				return check
			}
			const contentCheck = applyCheck("content", "content", Boolean(payload?.checks?.hasContent))
			applyCheck("location", "location", Boolean(payload?.checks?.hasLocation))
			const photosCheck = applyCheck("images", "photos", Boolean(payload?.checks?.hasImages))
			const subtypeCheck = applyCheck("subtype", "subtype", Boolean(payload?.checks?.hasSubtype))
			const roomsCheck = config.isHotel
				? applyCheck("variants", "rooms", Boolean(payload?.checks?.hasVariants))
				: null
			const houseRulesCheck = config.isHotel
				? applyCheck("houseRules", "houseRules", Boolean(payload?.checks?.hasHouseRules))
				: null
			const conditionsCheck = config.isHotel
				? applyCheck("conditions", "bookingPolicies", false)
				: null
			const hasVariants = Boolean(roomsCheck?.complete ?? payload?.checks?.hasVariants)
			const hasHouseRules = Boolean(houseRulesCheck?.complete ?? payload?.checks?.hasHouseRules)

			hydratePreparationCard(config, payload)
			const preparation = payload.preparation ?? null
			const isPublished =
				String(payload?.status ?? "")
					.trim()
					.toLowerCase() === "published" || Boolean(preparation?.isPublished)
			const readyToPublish = Boolean(preparation?.readyToPublish)
			setText(
				"productHeaderMeta",
				resolveProductPreparationHeaderTitle({
					isPublished,
					readyToPublish,
					workspaceSingularLabel: config.workspaceSingularLabel,
				})
			)
			setText(
				"productHeaderSummary",
				resolveProductPreparationHeaderSummary({
					isPublished,
					readyToPublish,
					completedChecks: Number(
						preparation?.completedChecks ?? payload.progress?.completedSteps ?? 0
					),
					totalChecks: Number(preparation?.totalChecks ?? payload.progress?.totalSteps ?? 0),
					blockerLabels: Array.isArray(preparation?.blockerPreview)
						? preparation.blockerPreview.map(String)
						: [],
				})
			)

			if (config.isTour) {
				applyCheck("variants", "departure", Boolean(payload?.checks?.hasVariants))
			}

			setText("summaryDescription", String(payload?.content?.descriptionPreview ?? ""))
			setText("summaryHighlights", `Destacados: ${Number(payload?.content?.highlightsCount ?? 0)}`)
			setText("summaryAddress", address)
			const locationPreview = document.querySelector<HTMLElement>("[data-product-location-preview]")
			if (locationPreview) {
				const rawLatitude = payload?.location?.latitude
				const rawLongitude = payload?.location?.longitude
				const latitude = typeof rawLatitude === "number" ? rawLatitude : Number.NaN
				const longitude = typeof rawLongitude === "number" ? rawLongitude : Number.NaN
				locationPreview.dataset.latitude = Number.isFinite(latitude) ? String(latitude) : ""
				locationPreview.dataset.longitude = Number.isFinite(longitude) ? String(longitude) : ""
				locationPreview.dataset.locationResolved = "true"
				document.dispatchEvent(new CustomEvent("product-location-preview:update"))
			}
			setText("summaryImagesCount", `${Number(payload?.images?.count ?? 0)} fotos cargadas`)
			if (photosCheck?.detail) setText("summaryImagesCount", photosCheck.detail)
			setText("summaryProductType", subtypeSummary)
			if (subtypeCheck?.detail) setText("summaryProductType", subtypeCheck.detail)
			if (contentCheck?.detail) setText("summaryHighlights", contentCheck.detail)

			if (config.isTour) {
				const guideLanguages = Array.isArray(subtypeDetails.guideLanguages)
					? subtypeDetails.guideLanguages.filter(Boolean).join(", ")
					: ""
				const duration = String(subtypeDetails.duration || "").trim()
				const difficulty = String(subtypeDetails.difficultyLevel || "").trim()
				const includes = String(subtypeDetails.includes || "").trim()
				setText(
					"summaryItinerary",
					highlightsCount > 0
						? `Itinerario resumido en ${highlightsCount} destacados de contenido.`
						: "Agrega destacados para explicar la secuencia de la experiencia."
				)
				setText(
					"summaryTourDetails",
					[
						duration ? `Duración: ${duration}` : "Duración pendiente",
						difficulty ? `Dificultad: ${difficulty}` : "",
						guideLanguages ? `Guía: ${guideLanguages}` : "Idiomas de guía pendientes",
						includes ? "Incluye configurado" : "",
					]
						.filter(Boolean)
						.join(" · ")
				)
			}
			if (config.isPackage) {
				const itinerary = String(subtypeDetails.itinerary || "").trim()
				const days = Number(subtypeDetails.days ?? 0)
				const nights = Number(subtypeDetails.nights ?? 0)
				const packageIncludes = String(subtypeDetails.includes || "").trim()
				const packageExcludes = String(subtypeDetails.excludes || "").trim()
				setText(
					"summaryItinerary",
					itinerary ? itinerary.slice(0, 160) : "Agrega el recorrido principal del paquete."
				)
				setText(
					"summaryPackageDuration",
					days > 0 || nights > 0 ? `${days} días / ${nights} noches` : "Duración pendiente."
				)
				setText(
					"summaryInclusions",
					[
						packageIncludes ? "Incluye configurado" : "Incluye pendiente",
						packageExcludes ? "No incluye configurado" : "No incluye opcional",
					].join(" · ")
				)
			}
			if (config.isHotel) {
				setText(
					"summaryRooms",
					roomsCheck?.detail ??
						(hasVariants
							? `${Number(payload?.variants?.count ?? 0)} habitaciones configuradas${
									Array.isArray(payload?.variants?.names) && payload.variants.names.length > 0
										? `: ${payload.variants.names.join(", ")}`
										: "."
								}`
							: "Agrega habitaciones para que este alojamiento pueda venderse correctamente.")
				)
				setText(
					"summaryHouseRules",
					houseRulesCheck?.detail ??
						(hasHouseRules
							? "Reglas principales listas para este alojamiento."
							: "Agrega las reglas principales para que el huésped sepa qué esperar.")
				)
				setText(
					"summaryConditions",
					conditionsCheck?.detail ?? "Define cancelación, pago, no presentación y horarios."
				)
			}
			if (config.isTour) {
				setText(
					"summaryRooms",
					hasVariants
						? `${Number(payload?.variants?.count ?? 0)} salidas configuradas${
								Array.isArray(payload?.variants?.names) && payload.variants.names.length > 0
									? `: ${payload.variants.names.join(", ")}`
									: "."
							}`
						: "Agrega salidas (horarios) para que este tour pueda venderse."
				)
			}

			const summaryImageGrid = document.getElementById("summaryImageGrid")
			if (summaryImageGrid) {
				summaryImageGrid.replaceChildren()
				const previews = Array.isArray(payload?.images?.previews) ? payload.images.previews : []
				if (previews.length === 0) {
					const empty = document.createElement("p")
					empty.className = "col-span-3 text-sm text-slate-500"
					empty.textContent = "Sin imágenes cargadas."
					summaryImageGrid.appendChild(empty)
				} else {
					for (const item of previews) {
						const img = document.createElement("img")
						img.src = String(item.url)
						img.alt = "Vista previa"
						img.className = "h-16 w-full rounded-[var(--fastt-radius-control)] object-cover"
						summaryImageGrid.appendChild(img)
					}
				}
			}

			const productHeroMedia = document.getElementById("productHeroMedia")
			const coverImage = payload?.images?.cover?.url ? String(payload.images.cover.url) : ""
			if (productHeroMedia && coverImage) {
				productHeroMedia.textContent = ""
				const heroImage = document.createElement("img")
				heroImage.src = coverImage
				heroImage.alt = `Foto principal de ${config.singularLabel}`
				heroImage.className = "h-full min-h-[220px] w-full object-cover"
				productHeroMedia.appendChild(heroImage)
			}

			console.debug("data hydrated", {
				page: "product-surface",
				durationMs: Number((performance.now() - hydrationStart).toFixed(1)),
			})
		})
		.catch(() => {
			if (controller.signal.aborted) return
			const progressText = document.querySelector("[data-product-progress-label]")
			if (progressText) progressText.textContent = "No se pudo cargar el progreso en este momento."
			const keys = ["content", "location", "images", "subtype"]
			if (config.isHotel) keys.push("variants", "houseRules")
			keys.forEach((key) => setBadgeState(key, false))
		})
}

if (document.documentElement.dataset.productSummaryHydrationBound !== "true") {
	document.documentElement.dataset.productSummaryHydrationBound = "true"
	document.addEventListener("astro:page-load", initProductSummaryHydration)
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initProductSummaryHydration, { once: true })
} else {
	initProductSummaryHydration()
}
