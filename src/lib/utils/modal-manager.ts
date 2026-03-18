type ModalHooks = {
	onOpen?: (modal: HTMLElement) => void
	onClose?: (modal: HTMLElement) => void
}

const hooks = new Map<string, ModalHooks>()

export function registerModal(name: string, modalHooks?: ModalHooks) {
	if (modalHooks) hooks.set(name, modalHooks)
}

export function openModal(name: string) {
	const modal = document.querySelector<HTMLElement>(`.modal-overlay[data-modal="${name}"]`)
	if (!modal) return

	modal.classList.remove("hidden", "hide")
	modal.classList.add("show")
	document.body.style.overflow = "hidden"

	hooks.get(name)?.onOpen?.(modal)
}

export function closeModal(name: string) {
	const modal = document.querySelector<HTMLElement>(`.modal-overlay[data-modal="${name}"]`)
	if (!modal) return

	modal.classList.remove("show")
	modal.classList.add("hide")

	setTimeout(() => {
		modal.classList.add("hidden")
		modal.classList.remove("hide")
		document.body.style.overflow = "auto"
		hooks.get(name)?.onClose?.(modal)
	}, 300)
}

document.addEventListener("click", (e) => {
	const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-open-modal]")
	if (!btn) return

	const name = btn.dataset.openModal
	if (!name) return

	openModal(name)
})

document.addEventListener("click", (e) => {
	const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-close-modal]")
	if (!btn) return

	const overlay = btn.closest<HTMLElement>(".modal-overlay")
	if (!overlay) return

	const name = overlay.dataset.modal
	if (!name) return

	closeModal(name)
})

document?.addEventListener("click", (e) => {
	const overlay = (e.target as HTMLElement).closest<HTMLElement>(".modal-overlay")
	if (!overlay) return

	if (e.target !== overlay) return

	const name = overlay.dataset.modal
	if (!name) return

	closeModal(name)
})
