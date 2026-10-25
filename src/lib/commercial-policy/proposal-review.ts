import { agreementTermsSchema } from "@/modules/financial/commercial-agreement-contract"

export function prepareProposalReview(data: FormData) {
	const terms = agreementTermsSchema.safeParse(Object.fromEntries(data))
	if (!terms.success)
		return {
			ok: false as const,
			issues: terms.error.issues.map((issue) => ({
				field: String(issue.path[0]),
				message: "Revisa este campo y la vigencia de la propuesta.",
			})),
		}
	const issues = [
		...(!String(data.get("signerUserId") ?? "").trim()
			? [{ field: "signerUserId", message: "Selecciona al representante autorizado." }]
			: []),
		...(String(data.get("representationReference") ?? "").trim().length < 8
			? [
					{
						field: "representationReference",
						message: "Registra la referencia de representación comprobada.",
					},
				]
			: []),
	]
	if (issues.length) return { ok: false as const, issues }
	return { ok: true as const, terms: terms.data }
}

export function bindProposalReview(form: HTMLFormElement): () => boolean {
	if (!form.hasAttribute("data-proposal-form")) return () => true
	const fields = form.querySelector<HTMLElement>("[data-proposal-fields]")!
	const panel = form.querySelector<HTMLElement>("[data-proposal-review]")!
	const review = form.querySelector<HTMLButtonElement>("[data-proposal-review-button]")!
	const summary = form.querySelector<HTMLElement>("[data-proposal-summary]")!
	const feedback = form.querySelector<HTMLElement>("[data-agreement-feedback]")!
	let reviewedData = ""
	const fingerprint = () => JSON.stringify([...new FormData(form).entries()])
	const edit = () => {
		panel.hidden = true
		fields.hidden = false
		review.hidden = false
		reviewedData = ""
	}
	const show = () => {
		const data = new FormData(form)
		const result = prepareProposalReview(data)
		if (!result.ok) {
			edit()
			for (const issue of result.issues) {
				const field = form.elements.namedItem(issue.field)
				if (
					field instanceof HTMLInputElement ||
					field instanceof HTMLTextAreaElement ||
					field instanceof HTMLSelectElement
				)
					field.setCustomValidity(issue.message)
			}
			form.reportValidity()
			return
		}
		if (!form.reportValidity()) return
		const date = (value: string) =>
			new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "UTC" }).format(
				new Date(`${value}T00:00:00Z`)
			)
		const signer = form.querySelector<HTMLSelectElement>('[name="signerUserId"]')!
		const pairs = [
			["Proveedor", form.dataset.sellerName ?? ""],
			["Cobro al viajero", "Directo por el proveedor"],
			["Comisión", `${result.terms.commissionPercent}% · ${result.terms.currency}`],
			["Base de cálculo", result.terms.commissionBase],
			["Vigencia", `${date(result.terms.effectiveFrom)} → ${date(result.terms.effectiveTo)}`],
			["Pago del viajero", result.terms.paymentTiming],
			["Conciliación", result.terms.settlementTerms],
			["Cancelaciones", result.terms.cancellationTerms],
			["Fiscalidad", result.terms.fiscalResponsibilities],
			["Representante autorizado", signer.selectedOptions[0]?.textContent ?? ""],
			["Referencia contractual", result.terms.documentReference],
			["Representación comprobada", String(data.get("representationReference"))],
		]
		summary.replaceChildren(
			...pairs.map(([label, value]) => {
				const entry = document.createElement("div")
				const title = document.createElement("dt")
				title.className = "text-slate-500"
				title.textContent = label
				const detail = document.createElement("dd")
				detail.className = "mt-1 whitespace-pre-wrap break-words text-slate-900"
				detail.textContent = value
				entry.append(title, detail)
				return entry
			})
		)
		form.querySelector<HTMLElement>("[data-proposal-full-terms]")!.textContent =
			result.terms.fullTerms
		feedback.textContent = ""
		reviewedData = fingerprint()
		fields.hidden = true
		review.hidden = true
		panel.hidden = false
		panel.focus()
	}
	form.addEventListener("input", (event) => {
		const field = event.target
		if (
			field instanceof HTMLInputElement ||
			field instanceof HTMLTextAreaElement ||
			field instanceof HTMLSelectElement
		)
			field.setCustomValidity("")
	})
	form.addEventListener("change", (event) => {
		const field = event.target
		if (
			field instanceof HTMLInputElement ||
			field instanceof HTMLTextAreaElement ||
			field instanceof HTMLSelectElement
		)
			field.setCustomValidity("")
	})
	review.addEventListener("click", show)
	form.addEventListener("commercial-proposal:edit", edit)
	form.querySelector("[data-proposal-edit]")!.addEventListener("click", () => {
		edit()
		review.focus()
	})
	return () => {
		if (!panel.hidden && reviewedData === fingerprint()) return true
		show()
		return false
	}
}
