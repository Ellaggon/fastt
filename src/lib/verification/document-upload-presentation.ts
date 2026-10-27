export const documentUploadErrorMessages: Record<string, string> = {
	document_subject_not_found:
		"El titular no es un guía o recurso vigente de este negocio. Selecciónalo nuevamente antes de enviar.",
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
		"No se pudo guardar en el almacenamiento de documentos. Inténtalo de nuevo en unos minutos.",
	document_storage_not_configured: "El almacenamiento de documentos no está configurado.",
	local_document_url_not_allowed: "Este entorno requiere almacenamiento en la nube (R2).",
	validation_error: "Los datos del envío no son válidos. Revisa el tipo de documento y el archivo.",
	forbidden: "Tu rol no puede enviar documentos. Pide acceso a Documentos en Equipo.",
}
