# Onboarding: fundamentos de la auditoría de septiembre

Status: archived
Document type: archive
Owner: Provider Experience
Last verified: 2026-09-28
Scope: fundamentos UX conservados de la auditoría del 13-09-2026
Source of truth: auditoría histórica; implementación vigente en los contratos enlazados
Review trigger: investigación de una regresión en entrada, continuidad o preparación

Este resumen conserva el razonamiento útil de la auditoría original. Sus inventarios,
wireframes y plan por fases fueron retirados porque describían una implementación anterior.
El texto completo permanece en Git. No prueba el estado actual ni certifica accesibilidad,
producción o capacidades comerciales.

Para trabajar ahora, comenzar en [onboarding](./onboarding/README.md),
[flujo de tours](./domains/tours/provider-workflow.md),
[alojamiento](./domains/lodging/README.md) o
[activación comercial](./onboarding/phase-4-policy-activation.md).

## Modelo de producto que debe entender la interfaz

### 1. Separar cuatro conceptos

| Concepto              | Qué representa                                | Ejemplo                                                | Dónde se edita                                    |
| --------------------- | --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Cuenta personal       | Persona que inicia sesión                     | Ana, propietaria o miembro del equipo                  | Menú de cuenta                                    |
| Negocio/proveedor     | Organización o titular que opera y cobra      | Andina Experiencias                                    | Configuración del negocio                         |
| Oferta/anuncio        | Servicio que ve el viajero                    | Tour gastronómico o Hotel Mirador                      | Mis tours / Mis alojamientos                      |
| Inventario reservable | Unidad con capacidad, precio y disponibilidad | Salida del sábado; habitación doble; vivienda completa | Salidas / Habitaciones / Calendario según el caso |

“Perfil de tours” debería desambiguarse: puede ser la presentación pública del operador o la ficha de un tour. No debe existir una única página que mezcle biografía del negocio, itinerario, cuenta bancaria y cupos.

La marca del negocio tampoco tiene por qué coincidir con el título de cada oferta. Una operadora puede vender cinco tours con nombres distintos, y una empresa puede administrar varios alojamientos.

### 2. Tres ejes de estado

No conviene crear un único porcentaje que mezcle identidad, fotografías, cuenta bancaria y reservas.

| Eje                      | Estados de interfaz recomendados                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Preparación de oferta    | Sin iniciar · Borrador · Ficha completa · Cambios pendientes                                  |
| Habilitación del negocio | Datos pendientes · En revisión · Requiere corrección · Habilitado para una capacidad concreta |
| Comercialización         | Sin publicar · Publicado · Reservable · Sin disponibilidad · Pausado                          |

Estos nombres son una propuesta de presentación y agregación. No implican sustituir automáticamente los estados persistidos de Fastt por un solo enum nuevo.

Ejemplo: **“Tu tour está completo. Falta aprobar el registro fiscal del negocio para publicarlo.”** Otro: **“Tu alojamiento está publicado, pero no tiene noches disponibles para reservar.”** Cada mensaje corresponde a una causa distinta y debe llevar a una acción distinta.

### 3. Requisitos históricos y autorización

La auditoría original describía controles globales de cuenta, fiscalidad y equipo.
Ese inventario quedó superado por el diagnóstico por línea, capacidad y experiencia.
No reutilizarlo para exigir cuenta bancaria o documentos hoteleros a todos los tours.
El principio conservado es que cambiar la presentación no elimina controles del servidor:
consultar el contrato vigente y mostrar el pendiente específico que devuelve.

## Reglas transversales de interacción

### 1. Guardado y reanudación

Cada paso tiene un único CTA principal. “Guardar y continuar” debe persistir y avanzar como una operación coherente. Evitar un botón Guardar dentro del formulario y otro Continuar que permita irse sin haber guardado.

Estados visibles: Guardando, Guardado, No se pudo guardar y Conflicto de edición. “Guardar y salir” no puede ser sólo un enlace: debe esperar confirmación de persistencia o explicar que queda trabajo sin guardar.

El servidor conserva datos guardados y referencias del recorrido. Un borrador local puede proteger texto aún no enviado, con alcance por cuenta, negocio y producto, limpieza y caducidad. Documentos de identidad, datos bancarios y secretos no deben copiarse a un mecanismo genérico de almacenamiento local.

Al reabrir, mostrar “Continúa con Fotos” a partir de los datos reales; no confiar únicamente en `?step=images` o en la última página visitada. Si hay varios borradores, permitir elegir. Al editar desde un dispositivo distinto, recuperar lo persistido; no prometer recuperar texto que nunca llegó al servidor.

### 2. Errores y validación

Errores junto al campo, resumen accesible cuando hay varios y foco en el primero. Conservar la entrada rechazada que sea apropiado preservar. Evitar mensajes como “validation_error”, “sin ID” o un JSON como explicación principal.

Separar error de red, falta de permisos, sesión expirada, dato inválido y requisito en revisión. Al expirar la sesión, permitir volver al contexto después de autenticarse. No crear otro proveedor por un reintento de guardado.

Si un destino no está disponible en el catálogo, ofrecer una alternativa real de corrección o soporte, sin aceptar una ubicación ficticia. Si el mapa falla, mantener el formulario de dirección utilizable.

### 3. Progreso honesto

“Etapa 2 de 4” indica posición. “6 de 9 requisitos completos” indica trabajo validado. Ninguno debe transformarse automáticamente en “puedes vender”.

Un requisito enviado a revisión se presenta como En revisión, no como Aprobado. La verificación puede terminar después de la ficha. Al cambiar una decisión que altera requisitos, explicar el nuevo pendiente y preservar datos compatibles.

### 4. Accesibilidad y presentación

Jerarquía con un título principal por pantalla, campos etiquetados y ejemplos cercanos. Navegación por teclado, estado actual de etapa anunciado, errores asociados a campos y guardado anunciado sin interrumpir cada pulsación. No comunicar estado sólo por color.

La paleta oscura actual no es un gap demostrado por la transcripción. Puede mantenerse si los contrastes y componentes son consistentes. La prioridad es reducir densidad y mejorar jerarquía, no cambiar el tema visual por preferencia.

Mantener lectura cómoda del formulario y separar ayudas del contenido requerido. No hacer que un acordeón o un tooltip sea la única manera de descubrir un requisito indispensable.

### 5. Finalización y primera reserva

La publicación debe ser una acción explícita. Al terminar, mostrar el estado devuelto por el servidor y un enlace al anuncio cuando exista. Si todavía no es reservable, explicar el requisito concreto. No afirmar que aparece en búsqueda sólo porque el registro cambió a publicado.

La primera reserva es un hito posterior: confirmar que el operador sabe encontrarla, ver participantes/huéspedes, conocer qué hacer y entender el estado del pago. No mantenerlo atrapado en el wizard después de haber activado una oferta.

## Límites que no desaparecen por completar código

- Validar el recorrido autenticado, teclado, móvil y lector de pantalla en el entorno objetivo.
- Medir el funnel con eventos reales; un inventario sin eventos no demuestra conversión.
- Distinguir guardar un borrador, completar documentos, aprobación, publicación y disponibilidad.
- Documentar la ratificación y modalidad de cobro antes de prometer capacidades nuevas.
- La comparación con Airbnb/Expedia orientó la experiencia; no aprueba requisitos legales.

Consultar las [certificaciones de tours](./certifications/tours/booking-flow-2026-09.md)
y [verificación](./certifications/verification/line-gates-2026-09-26.md) por su fecha y alcance.
