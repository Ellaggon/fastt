export function documentSubmissionKey(url: URL, form: string): string {
	const key = url.searchParams.get("documentSubmissionKey")
	return key && key.length <= 200 && url.searchParams.get("documentSubmissionForm") === form
		? key
		: crypto.randomUUID()
}

export function newDocumentSubmissionHref(url: URL): string {
	const target = new URL(url)
	for (const key of ["documentSubmissionKey", "documentSubmissionForm", "error", "result"])
		target.searchParams.delete(key)
	return target.pathname + target.search + target.hash
}

export const documentUploadErrorMessages: Record<string, string> = {
	document_registration_unconfirmed:
		"El archivo pudo recibirse, pero no pudimos confirmar el registro. Reintenta el mismo envío: no se duplicará.",
	document_submission_in_progress:
		"El envío sigue procesándose. Espera un momento antes de volver a intentarlo.",
	idempotency_key_reused_with_different_payload:
		"Este intento corresponde a otro archivo o datos. Inicia un envío nuevo para cambiarlos.",
	invalid_document_activity_class:
		"Revisa la actividad cubierta. Indica por separado actividades acuáticas y aéreas; no uses la categoría anterior combinada.",
	document_subject_not_found:
		"El titular no es una persona, recurso o prestador registrado de este negocio. Selecciónalo nuevamente antes de enviar.",
	document_subject_reference_required: "Selecciona el guía titular de la credencial.",
	document_subject_type_invalid:
		"El titular elegido no corresponde a este requisito. Revisa a quién se emitió el documento.",
	document_product_scope_required: "Selecciona la experiencia cubierta por el documento.",
	document_file_meta_required:
		"Faltó el tipo o nombre del archivo. Vuelve a elegir el PDF o la foto.",
	document_file_required: "No se recibió el archivo. Elige de nuevo el PDF o la imagen.",
	unsupported_mime_type: "Formato no permitido. Usa PDF, JPG, PNG, WEBP o HEIC.",
	file_too_large: "El archivo supera 12 MB. Sube una versión más liviana.",
	empty_file: "El archivo está vacío. Elige otro PDF o foto.",
	document_storage_upload_failed:
		"No se pudo guardar el archivo. El envío no fue confirmado; vuelve a seleccionar el archivo e inténtalo de nuevo.",
	document_storage_not_configured:
		"El almacenamiento de documentos no está disponible. El envío no fue confirmado.",
	local_document_url_not_allowed: "Este entorno requiere almacenamiento en la nube (R2).",
	validation_error: "Los datos del envío no son válidos. Revisa el tipo de documento y el archivo.",
	forbidden: "Tu rol no puede enviar documentos. Pide acceso a Documentos en Equipo.",
}
