/** Visual feedback while verification POST forms navigate (fiscal, docs, pagos). */
const VERIFICATION_ROOT_SELECTOR =
	"[data-verification-page], [data-verification-fiscal-page], [data-verification-payments-page], [data-verification-trust-panels-stage]"

function isVerificationPostForm(form) {
	if (!(form instanceof HTMLFormElement)) return false
	if (String(form.method ?? "get").toLowerCase() !== "post") return false
	return Boolean(form.closest(VERIFICATION_ROOT_SELECTOR))
}

function ensureSubmitBar() {
	let bar = document.querySelector("[data-verification-submit-bar]")
	if (bar instanceof HTMLElement) return bar
	bar = document.createElement("div")
	bar.className = "fastt-verification-submit-bar"
	bar.dataset.verificationSubmitBar = "true"
	bar.setAttribute("role", "status")
	bar.setAttribute("aria-live", "polite")
	bar.innerHTML =
		'<span class="fastt-verification-submit-bar__track" aria-hidden="true"><span class="fastt-verification-submit-bar__fill"></span></span><span class="fastt-verification-submit-bar__label">Enviando…</span>'
	document.body.appendChild(bar)
	return bar
}

function markSubmitPending(form) {
	form.dataset.verificationSubmitting = "true"
	form.setAttribute("aria-busy", "true")
	const bar = ensureSubmitBar()
	bar.hidden = false
	document.documentElement.dataset.verificationSubmitPending = "true"

	const controls = form.querySelectorAll('button[type="submit"], input[type="submit"]')
	for (const control of controls) {
		if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement)) continue
		if (!control.dataset.submitDefaultLabel) {
			control.dataset.submitDefaultLabel =
				control instanceof HTMLButtonElement ? (control.textContent?.trim() ?? "") : control.value
		}
		control.dataset.submitPending = "true"
		control.disabled = true
		if (control instanceof HTMLButtonElement) {
			control.textContent = "Enviando…"
		} else {
			control.value = "Enviando…"
		}
	}
}

function bindVerificationSubmitPending() {
	if (window.__fasttVerificationSubmitPending) return
	window.__fasttVerificationSubmitPending = true

	document.addEventListener(
		"submit",
		(event) => {
			if (event.defaultPrevented) return
			const form = event.target
			if (!isVerificationPostForm(form)) return
			markSubmitPending(form)
		},
		false
	)
}

bindVerificationSubmitPending()
document.addEventListener("astro:page-load", bindVerificationSubmitPending)
