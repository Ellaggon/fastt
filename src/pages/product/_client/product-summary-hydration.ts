type ProductSummaryConfig = {
	productId: string
	isHotel: boolean
	isTour: boolean
	isPackage: boolean
	singularLabel: string
	workspaceSingularLabel: string
	previewHref: string
	roomsHref: string
	ratesHref: string
	conditionsHref: string
	calendarHref: string
	houseRulesHref: string
}

function bool(value: string | undefined): boolean {
	return value === "true"
}

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;")
}

function buttonHref(href: string): string {
	return escapeHtml(href || "#")
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
		roomsHref: root.dataset.roomsHref || "",
		ratesHref: root.dataset.ratesHref || "",
		conditionsHref: root.dataset.conditionsHref || "",
		calendarHref: root.dataset.calendarHref || "",
		houseRulesHref: root.dataset.houseRulesHref || "",
	}
}

function badge(id: string): string {
	return `<span id="${id}" class="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Cargando...</span>`
}

function card(markup: string, extra = ""): string {
	return `<div class="rounded-[var(--fastt-radius-card)] border border-slate-200 bg-white p-5 ${extra}">${markup}</div>`
}

function actionButton(href: string, label: string, primary = false): string {
	const classes = primary
		? "inline-flex w-full items-center justify-center rounded-[var(--fastt-radius-control)] bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
		: "inline-flex w-full items-center justify-center rounded-[var(--fastt-radius-control)] border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
	return `<a href="${buttonHref(href)}" data-astro-prefetch class="${classes}">${escapeHtml(label)}</a>`
}

function ensureProductShell(config: ProductSummaryConfig): void {
	const root = document.querySelector<HTMLElement>("[data-product-deferred-root]")
	if (!root || root.dataset.ready === "true") return
	root.dataset.ready = "true"

	const verticalCards: string[] = []
	if (config.isTour) {
		verticalCards.push(
			card(
				`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Itinerario</p><p id="summaryItinerary" class="mt-2 text-sm leading-6 text-slate-600">Cargando itinerario...</p></div>${badge("blockBadge-subtype")}</div><p class="mt-3 text-sm text-slate-500">Explica la secuencia de la experiencia.</p>`
			)
		)
		verticalCards.push(
			card(
				`<p class="text-sm font-semibold text-slate-950">Duración y guía</p><p id="summaryTourDetails" class="mt-2 text-sm leading-6 text-slate-600">Cargando duración y guía...</p><p class="mt-3 text-sm text-slate-500">Define duración, dificultad e idiomas de guía.</p>`
			)
		)
	}
	if (config.isPackage) {
		verticalCards.push(
			card(
				`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Itinerario</p><p id="summaryItinerary" class="mt-2 text-sm leading-6 text-slate-600">Cargando itinerario...</p></div>${badge("blockBadge-subtype")}</div>`
			)
		)
		verticalCards.push(
			card(
				`<p class="text-sm font-semibold text-slate-950">Días y noches</p><p id="summaryPackageDuration" class="mt-2 text-sm leading-6 text-slate-600">Cargando duración...</p>`
			)
		)
		verticalCards.push(
			card(
				`<p class="text-sm font-semibold text-slate-950">Inclusiones</p><p id="summaryInclusions" class="mt-2 text-sm leading-6 text-slate-600">Cargando inclusiones...</p>`
			)
		)
	}
	if (config.isHotel) {
		verticalCards.push(
			card(
				`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Tipo y características</p><p id="summaryProductType" class="mt-2 text-sm leading-6 text-slate-600">Cargando tipo...</p><p id="summarySubtype" class="mt-1 text-sm text-slate-500">Características: -</p></div>${badge("blockBadge-subtype")}</div>`
			)
		)
	}

	root.innerHTML = `
		<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
			<div class="space-y-5">
				<div class="grid gap-4 lg:grid-cols-2">
					<div class="overflow-hidden rounded-[var(--fastt-radius-card)] border border-slate-200 bg-white p-0 lg:col-span-2">
						<div class="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
							<div id="productHeroMedia" class="flex min-h-[260px] items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">Fotos de ${escapeHtml(config.singularLabel)}</div>
							<div class="flex flex-col justify-between gap-5 p-5 md:p-6">
								<div class="space-y-3">
									<div class="flex items-start justify-between gap-4">
										<div><p class="text-sm font-semibold text-slate-950">Fotos principales</p><p id="summaryImagesCount" class="mt-1 text-sm text-slate-600">Cargando fotos...</p></div>
										${badge("blockBadge-images")}
									</div>
									<div id="summaryImageGrid" class="grid min-h-[74px] grid-cols-3 gap-2"></div>
								</div>
								<a href="/product/${encodeURIComponent(config.productId)}/images" data-astro-prefetch class="self-end text-sm font-semibold text-slate-800">Gestionar fotos</a>
							</div>
						</div>
					</div>
					${card(`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Descripción</p><p id="summaryDescription" class="mt-2 text-sm leading-6 text-slate-600">Cargando descripción...</p><p id="summaryHighlights" class="mt-2 text-sm text-slate-500">Destacados: -</p></div>${badge("blockBadge-content")}</div><a href="/product/${encodeURIComponent(config.productId)}/content" data-astro-prefetch class="mt-4 inline-flex text-sm font-semibold text-slate-800">Editar descripción</a>`)}
					${card(`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Ubicación</p><p id="summaryAddress" class="mt-2 text-sm leading-6 text-slate-600">Cargando dirección...</p></div>${badge("blockBadge-location")}</div><a href="/product/${encodeURIComponent(config.productId)}/location" data-astro-prefetch class="mt-4 inline-flex text-sm font-semibold text-slate-800">Editar ubicación</a>`)}
					${verticalCards.join("")}
				</div>
			</div>
			<aside class="space-y-4" aria-label="Operación">
				${card(`<p class="text-sm font-semibold text-slate-950">Acciones principales</p><div class="mt-4 grid gap-2">${actionButton(config.previewHref, "Vista previa", true)}${config.isHotel ? actionButton(config.roomsHref, "Abrir habitaciones") + actionButton(config.ratesHref, "Abrir tarifas") + actionButton(config.conditionsHref, "Abrir condiciones") + actionButton(config.calendarHref, "Abrir calendario") : ""}</div>`)}
				${config.isHotel ? card(`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Habitaciones</p><p id="summaryRooms" class="mt-2 text-sm leading-6 text-slate-600">Cargando habitaciones...</p></div>${badge("blockBadge-variants")}</div><a href="${buttonHref(config.roomsHref)}" data-astro-prefetch class="mt-4 inline-flex text-sm font-semibold text-slate-800">Gestionar habitaciones</a>`) : ""}
				${config.isHotel ? card(`<p class="text-sm font-semibold text-slate-950">Condiciones de reserva</p><p class="mt-2 text-sm leading-6 text-slate-600">Cancelación, pagos, no presentación y horarios.</p><a href="${buttonHref(config.conditionsHref)}" data-astro-prefetch class="mt-4 inline-flex text-sm font-semibold text-slate-800">Gestionar condiciones</a>`) : ""}
				${config.isHotel ? card(`<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-slate-950">Reglas para huéspedes</p><p id="summaryHouseRules" class="mt-2 text-sm leading-6 text-slate-600">Cargando reglas...</p></div>${badge("blockBadge-houseRules")}</div><a href="${buttonHref(config.houseRulesHref)}" data-astro-prefetch class="mt-4 inline-flex text-sm font-semibold text-slate-800">Editar reglas</a>`) : ""}
			</aside>
		</div>`
}

function setBadgeState(key: string, complete: boolean): void {
	const badgeElement = document.getElementById(`blockBadge-${key}`)
	if (!badgeElement) return
	badgeElement.textContent = complete ? "Completo" : "Pendiente"
	badgeElement.className = complete
		? "inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
		: "inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
}

function setText(id: string, value: string): void {
	const element = document.getElementById(id)
	if (element) element.textContent = value
}

export function initProductSummaryHydration(): void {
	const configRoot = document.querySelector<HTMLElement>("[data-product-summary-config]")
	if (!configRoot || configRoot.dataset.hydrationReady === "true") return
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

	const hydrationStart = performance.now()
	fetch(`/api/internal/product-summary?productId=${encodeURIComponent(config.productId)}`, {
		headers: { accept: "application/json" },
		cache: "no-store",
	})
		.then(async (response) => {
			if (!response.ok) throw new Error(`summary_${response.status}`)
			return await response.json()
		})
		.then((payload) => {
			ensureProductShell(config)

			const preparation = payload?.preparation ?? null
			const missing = Number(preparation?.blockerCount ?? payload?.progress?.missingSteps ?? 0)
			const percent = Number(
				preparation?.readinessPercent ?? payload?.progress?.progressPercent ?? 0
			)
			const completed = Number(payload?.progress?.completedSteps ?? 0)
			const total = Number(payload?.progress?.totalSteps ?? 0)
			const address = String(payload?.location?.address || "Ubicación pendiente")
			const productType = String(payload?.vertical?.label || config.workspaceSingularLabel)
			const subtypeSummary = String(payload?.subtype?.summary || "Características pendientes")
			const subtypeDetails = payload?.subtype?.details || {}
			const highlightsCount = Number(payload?.content?.highlightsCount ?? 0)
			const hasVariants = Boolean(payload?.checks?.hasVariants)
			const hasHouseRules = Boolean(payload?.checks?.hasHouseRules)

			const missingStepsText = document.getElementById("productMissingStepsText")
			const progressBar = document.getElementById("productProgressBar")
			const progressText = document.getElementById("productProgressText")
			if (missingStepsText) {
				if (preparation?.readyToPublish) {
					missingStepsText.textContent =
						"Todo listo. Revisa la vista previa y confirma la publicación."
				} else if (preparation?.blockerCount > 0) {
					const preview = Array.isArray(preparation.blockerPreview)
						? preparation.blockerPreview
								.map((label: unknown) => String(label).toLowerCase())
								.join(", ")
						: ""
					missingStepsText.textContent = `Faltan ${preparation.blockerCount} paso${preparation.blockerCount === 1 ? "" : "s"} del playbook${preview ? `: ${preview}` : ""}.`
				} else {
					missingStepsText.textContent =
						missing === 0
							? "La ficha está lista para revisión final."
							: `Faltan ${missing} puntos para completar la ficha.`
				}
			}
			if (progressBar) {
				const progressValue = progressBar.querySelector<HTMLElement>(".fastt-progress-value")
				if (progressValue) progressValue.style.width = `${Math.max(0, Math.min(100, percent))}%`
			}
			if (progressText) {
				progressText.textContent = preparation
					? `${percent}% de preparación completada`
					: `${completed} de ${total} puntos internos listos.`
			}
			setText("productHeaderMeta", address)
			setText(
				"productHeaderSummary",
				"Administra la ficha pública, habitaciones y reglas. Las tarifas y el calendario se gestionan desde Venta."
			)

			setBadgeState("content", Boolean(payload?.checks?.hasContent))
			setBadgeState("location", Boolean(payload?.checks?.hasLocation))
			setBadgeState("images", Boolean(payload?.checks?.hasImages))
			setBadgeState("subtype", Boolean(payload?.checks?.hasSubtype))
			if (config.isHotel) {
				setBadgeState("variants", hasVariants)
				setBadgeState("houseRules", hasHouseRules)
			}

			setText("summaryDescription", String(payload?.content?.descriptionPreview ?? ""))
			setText("summaryHighlights", `Destacados: ${Number(payload?.content?.highlightsCount ?? 0)}`)
			setText("summaryAddress", address)
			setText("summaryImagesCount", `${Number(payload?.images?.count ?? 0)} fotos cargadas`)
			setText("summaryProductType", productType)
			setText("summarySubtype", subtypeSummary)

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
					hasVariants
						? `${Number(payload?.variants?.count ?? 0)} habitaciones configuradas${
								Array.isArray(payload?.variants?.names) && payload.variants.names.length > 0
									? `: ${payload.variants.names.join(", ")}`
									: "."
							}`
						: "Agrega habitaciones para que este alojamiento pueda venderse correctamente."
				)
				setText(
					"summaryHouseRules",
					hasHouseRules
						? "Reglas principales listas para este alojamiento."
						: "Agrega las reglas principales para que el huésped sepa qué esperar."
				)
			}

			const summaryImageGrid = document.getElementById("summaryImageGrid")
			if (summaryImageGrid) {
				summaryImageGrid.innerHTML = ""
				const previews = Array.isArray(payload?.images?.previews) ? payload.images.previews : []
				if (previews.length === 0) {
					summaryImageGrid.innerHTML = `<p class="col-span-3 text-sm text-slate-500">Sin imágenes cargadas.</p>`
				} else {
					for (const item of previews) {
						const img = document.createElement("img")
						img.src = String(item.url)
						img.alt = "Vista previa"
						img.className = "h-16 w-full rounded-md border border-slate-200 object-cover"
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
			const progressText = document.getElementById("productProgressText")
			if (progressText) progressText.textContent = "No se pudo cargar el progreso en este momento."
			const keys = ["content", "location", "images", "subtype"]
			if (config.isHotel) keys.push("variants", "houseRules")
			keys.forEach((key) => setBadgeState(key, false))
		})
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initProductSummaryHydration, { once: true })
} else {
	initProductSummaryHydration()
}
