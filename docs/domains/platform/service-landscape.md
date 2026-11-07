# Servicios de Fastt

Status: active
Document type: canonical
Owner: Titular del proyecto (operacion unipersonal)
Last verified: 2026-11-07
Scope: dependencias actuales, requisitos de beta y servicios futuros; no autoriza contratacion
Source of truth: codigo enlazado, evidencia fechada de paneles y decisiones del titular
Related code/tests: scripts/service-inventory.mjs, scripts/service-inventory.test.mjs, astro.config.mjs, vercel.json, services/document-analysis/analyze.mjs
Review trigger: revision semanal, cambio de plan/entorno, nueva integracion o apertura comercial

## Como interpretar este mapa

Mapa de dependencias, no factura ni certificacion. Implementado, configurado, desplegado,
utilizado y contratado son estados distintos. Desconocido no equivale a gratuito.
El titular asume operacion y aprobaciones; este mapa no autoriza pagos ni activaciones.
La beta comercial por invitacion sigue pendiente del
[runbook de beta](../../runbooks/private-beta-release.md).

## Servicios actuales y candidatos

Los planes de panel indicados son observaciones fechadas de noviembre de 2026, no
precios garantizados. Los datos heredados del inventario local del 4 de noviembre siguen
siendo parciales; reverificar antes de una decision economica.

| Servicio | Funcion / consumidor | Entorno y estado conocido | Decision actual |
| --- | --- | --- | --- |
| GitHub | Repositorio, PR, Actions y artefactos | Uso de repositorio/CI confirmado; plan, minutos facturables y retencion pendientes de conciliar | Mantener; no sumar suscripcion supuesta |
| Vercel | Astro SSR, API, previews y cron | Hosting existente; Hobby observado en panel. Destinos efectivos por despliegue no quedan certificados por este mapa | Mantener durante evaluacion; no abrir piloto comercial en Hobby |
| Netlify | Hosting alternativo de Astro SSR | Sitio de evaluacion publicado desde rama separada; Free Legacy observado, no el plan nuevo por creditos | Evaluar, no migrar aun |
| Supabase PostgreSQL | Datos operativos, read models, jobs y auditoria | Proyecto fastt compartido por entorno actual y evaluacion Netlify autorizada; backup separado no aprobado como staging | Mantener PostgreSQL/Drizzle; no crear otra DB solo para cambiar hosting |
| Supabase Auth | Login, sesiones y recuperacion | Lectura autenticada comprobada en Netlify; entrega de correo y recorridos completos pendientes | Mantener; DB/Auth pueden compartir factura |
| Cloudflare R2: imagenes | Imagenes y URLs firmadas | Adaptador S3 existente; servicio usado por la aplicacion. Vinculos efectivos por entorno pendientes | Mantener; separar credenciales del bucket documental |
| Cloudflare R2: documentos | Originales privados y cuarentena | Buckets de desarrollo/staging registrados en auditoria; CORS staging observado anteriormente no certifica pipeline hospedado | No habilitar originales sensibles sin inspeccion certificada |
| Upstash Redis / Redis | Cache compartida, contadores y rollout | Driver REST y Redis implementados; instancia fastt Free observada, enlace efectivo de cada consumidor pendiente | Mantener candidato existente; Redis y Upstash no implican dos contratos |
| Resend | Correo transaccional de la app | Adaptador implementado; panel Free observado. Dominio remitente y entrega operativa sin certificar | Resolver correo antes de invitar usuarios |
| Dominio / DNS | Identidad publica, remitente y autenticacion de correo | El titular indica que no compro dominio. Subdominios del hosting sirven para evaluacion | Dominio controlado necesario para la ruta de correo elegida; no comprar aun |
| Gateway documental propio | Antivirus, PDF y OCR | Contenedor existente; no hay despliegue hospedado certificado | Pruebas locales solo con sinteticos |
| Dispatcher documental propio | Reclamar jobs y llamar al worker | Proceso y pruebas existentes; alojamiento permanente no certificado | No confundir con cron diario ni con un SaaS contratado |
| Google Cloud Run | Candidato a ejecutar gateway | Proyecto de evaluacion visible; registro detenido por prepago requerido | Pausado por decision del titular; no desplegar |
| Oracle Cloud | Candidato anterior para gateway | Registro bloqueado por tarjeta segun titular; capacidad gratuita no certificada | Pausado; no adaptar ARM sin capacidad |
| Render | Plantilla para gateway/dispatcher | Blueprint en codigo; titular indica no tener cuenta ni servicios propios, sin contratacion verificada | No crear recursos pagos; no contar blueprint como factura |
| Cloudmersive | Candidato API antivirus/OCR | No integrado ni certificado para Fastt; no sustituto directo | No seleccionado para documentos reales |
| Channex | Channel manager | Cliente sandbox/produccion en codigo; panel staging observado, contrato/precio desconocidos | Sandbox hasta certificar operacion y acuerdo |
| Cloudbeds | Conector PMS/channel manager | Clientes y smoke checks en codigo; servicio contratado no confirmado | Opcional; no activar por presencia de codigo |
| iCal externo | Importacion/exportacion de calendarios | Procesamiento y cron existentes; depende del servidor remoto de cada feed | Certificar frescura/conflictos; no promete tiempo real |
| OpenStreetMap / Nominatim | Teselas y geocodificacion | Llamadas publicas presentes en mapas y API; no requiere secreto para ser dependencia externa | Revisar atribucion, limites y privacidad antes de ampliar |
| Google Fonts / unpkg | Fuente tipografica y CSS Leaflet | Recursos remotos en layout; no equivalen a suscripciones | Evaluar servir assets locales para reducir dependencia |
| Stripe Connect | Verificacion bancaria ACH opcional | Adaptador con opt-in; caso automatico limitado a US/USD; no acredita cobros ni payouts operativos | Fuera del piloto Bolivia de pago directo |
| Persona/Jumio u otro identity vendor | Verificacion externa/liveness opcional | Contrato/adaptador configurable; operacion real no certificada | No contratar salvo requisito aplicable |
| Bureau fiscal externo | Validacion tributaria opcional | Adaptador TIN configurable; no demuestra cobertura boliviana | No contratar ni afirmar validacion local por defecto |
| OpenAI / Anthropic | Posibles funciones IA | Referencias de inventario/SDK no prueban un consumidor ni suscripcion activa | Investigar consumidor antes de presupuestar |

### Evidencia y rutas de codigo

- Hosting: `astro.config.mjs`, `vercel.json`; Netlify solo en rama de evaluacion.
- Datos/storage: `src/shared/infrastructure/db/client.ts`, `src/container/shared.container.ts`.
- Cache/email: `src/lib/cache/persistentCache.ts`, `src/lib/email/sendTransactionalEmail.ts`.
- Documentos: `services/`, `src/lib/documents/document-processing.ts`.
- Conectores: `src/lib/channel-manager/`, `src/lib/provider-channel-manager-properties.ts`.
- Publicos: `src/pages/api/geocode.ts`, `src/components/MapPicker.astro`, `src/layouts/Layout.astro`.
- Opcionales: `src/lib/payout-rail/`, `src/lib/identity-vendor/`, `src/lib/tin-bureau/`.

## Entornos: lo permitido y lo no certificado

- Local: no es automaticamente aislado; verificar destino DB/Auth antes de escribir.
- Vercel Preview/Production: conciliar valores efectivos por despliegue en privado.
  Un alcance de variable no acredita su destino ni autoriza escrituras de prueba.
- Netlify: evaluacion con DB/Auth compartidas autorizadas por el titular, no staging
  aislado. Login y catalogo privado comprobados; tarifas/calendario, rendimiento y
  recorrido completo aun no certificados. Bloqueo de comandos a nivel aplicacion,
  no permisos SQL de solo lectura: GET puede materializar datos. Sin credenciales
  de migraciones, Redis, correo ni archivos transferidas para esta evaluacion.
- Backup: no convertirlo en staging ni someterlo a pruebas destructivas sin decision
  expresa y preservacion. Tener un proyecto llamado backup no prueba restauracion.
- Documentos: la proteccion desactivada por defecto esta en la rama documental;
  verificar commit desplegado y flags efectivos. Un cambio publicado en PR no
  demuestra proteccion en cada entorno. No cambiar flags durante esta documentacion.

## Decision documental vigente

El 7 de noviembre de 2026 se leyo en el registro de Google Cloud un requisito de
prepago unico de **CLP 30.000** para activar la prueba con el medio elegido.
No se confirmo el pago ni se desplego el procesador durante la revision. No confundir
importe solicitado con gasto efectuado o mensualidad. Google describe devolucion del
importe no utilizado al cerrar facturacion, no reembolso automatico a los pocos dias.
El titular decide **pausar esta via para no desembolsar ahora**. No borrar el proyecto.

Cloud Run sigue siendo candidato tecnico, no servicio gratuito garantizado. Reanudar
solo con autorizacion economica, cuenta/modalidad comprobada, limites operativos y
medicion sintetica. Incluir imagenes, builds, red y logs al evaluar consumo. Una alerta
de presupuesto no es un tope de gasto. No activar pago por uso sin decision expresa.

El gateway actual usa ClamAV, firmas de menos de 48 horas, SHA-256, qpdf, pdfinfo,
pdftoppm y Tesseract. Acepta hasta 12 MiB. PDF multipagina no recibe OCR completo;
extraccion de campos queda sin soporte y tamper inconcluso. No acredita autenticidad.
Antivirus limpio no sustituye revision humana ni prueba validez comercial.

Cloudmersive requeriria adaptador, validacion de limites, privacidad y certificacion;
su gratuito esta orientado a evaluacion, admite una peticion simultanea y comparte
consumo entre APIs. No equivale a la ejecucion del contenedor existente. No enviar
documentos personales a un scanner externo sin evaluacion y autorizacion aplicables.

Continuar con sinteticos locales no cierra el requisito de documentos hospedados.
Si una oferta exige documentos, no abrirla sin esa capacidad certificada ni sustituirla
por abrir originales en una laptop o enviarlos por correo.

## Comparacion: minimo operativo de beta frente a lo disponible

Ideal aqui significa minimo suficiente y certificado, no infraestructura empresarial.
Alcance: cohorte pequena, pago directo al proveedor y cupo dedicado a Fastt; admitir
solo ofertas autorizadas. **Hoy no hay evidencia suficiente para declarar apertura.**

| Necesidad de beta | Disponible hoy | Brecha y decision recomendada |
| --- | --- | --- |
| Un hosting comercial SSR/API | Vercel Hobby y Netlify de evaluacion | Preferir certificar Netlify existente antes de pagar otro hosting; aun no es sustituto operativo aprobado |
| DB y autenticacion | Supabase y login probado en Netlify | Reutilizar; certificar permisos, recuperacion, reservas y capacidad. No exige otro proveedor |
| Imagenes | R2 + adaptador S3 | Reutilizar; comprobar lectura/carga y permisos desde el hosting final |
| Documentos privados seguros | R2 privado + gateway/dispatcher en codigo | Falta ejecucion hospedada certificada. Es bloqueante donde haya documentos obligatorios; ningun hosting gratuito ha quedado aprobado |
| Correos reales | Resend Free observado y Auth existente | Falta remitente/dominio controlado y entrega probada; SMTP de Auth y correo de la app se configuran por separado |
| Cache compartida | Upstash/Redis implementado | Verificar enlace, invalidacion y latencia en hosting final; no contratar un segundo Redis |
| Jobs fiables | Cron Vercel y procesos propios | Trasladar/certificar tareas necesarias; Netlify no ejecuta `vercel.json`. Probar reintentos, limpieza y alertas sin duplicar jobs |
| Respaldo recuperable | Supabase + proyecto backup | Falta restauracion demostrada, alcance y RPO/RTO. Un backup nominal no basta; no obliga por si solo a un plan pago |
| Errores, seguridad y soporte | Logs/timings, controles y titular | Certificar alertas, permisos y pausa de ventas; no necesita otro SaaS de monitoreo por defecto |
| Codigo y entrega repetible | GitHub/CI y ramas de evaluacion | Mantener; seleccionar commit certificado, rollback y limites de consumo |

### Seleccion concreta y limites

Conservar **Supabase + R2 + Upstash + GitHub** y completar **Resend/SMTP**.
**Netlify es el candidato de hosting comercial a certificar**, no una migracion autorizada.
No hace falta mantener dos hostings productivos para la beta; Vercel permanece intacto
mientras se evalua. Cambiar hosting exige probar sesiones, APIs, jobs, archivos y latencia,
no solo compilacion. No copiar secretos adicionales por este documento.

Las dos brechas de provision mas claras son **correo con dominio controlado** y
**ejecucion documental hospedada**. Ninguna tiene solucion integral de costo cero
certificada hoy. Google Cloud esta pausado por prepago; Cloudmersive no la sustituye
automaticamente. Presentar costo/condiciones para decision antes de contratar.
Lo restante necesita principalmente configuracion y certificacion, no mas proveedores.

**Channex/Cloudbeds e iCal no son obligatorios para abrir** si la cohorte acepta cupo
dedicado, gestion manual trazable y no depende de sincronizacion externa. No retirarlos
ni activar conexiones: conservar sandbox. Si un proveedor comparte cupo con otros canales,
esta exclusion deja de servir y debe certificar sincronizacion o quedar fuera de cohorte.

**Stripe, payouts, KYC externo, bureau e IA no son requisitos generales** del piloto
elegido. El viajero paga al proveedor y Fastt concilia su comision aparte. Excluir servicios
opcionales no exime de evidencia obligatoria, contratos ni validacion humana aplicable.

Antes de abrir: cerrar correo y procesamiento documental, certificar hosting y recuperacion,
y probar con evidencia reserva/hold/confirmacion/cancelacion, politicas y soporte. Tener
todos los proveedores contratados no acredita esos recorridos. Mantener no-go mientras
falle una puerta del runbook, sin prometer beta comercial completa sin desembolsos.

### Servicios futuros solo si hay necesidad medida

Evaluar DB con mayor capacidad/backups/PITR segun recuperacion y uso; hosting documental
sostenido segun memoria, tiempos y cola; channel manager si se comparte inventario;
mapas/geocodificacion contratados o propios si las politicas/cuotas publicas no bastan.
KYC, bureau, IA y cobro intermediado requieren decision especifica, no una fecha arbitraria.
No fijar upgrades por numero supuesto de usuarios: medir cuotas, riesgo y soporte;
limitar admision antes de exceder capacidad.

## Facturacion, inventario y mantenimiento

`pnpm ops:services:inventory` inspecciona presencia de configuracion local sin red ni
valores secretos; no descubre todas las cuentas ni lee paneles. Su lista estatica aun
no incluye Netlify, Google Cloud ni dependencias publicas: este mapa las explicita.
Pruebas del inventario: `pnpm test:services:inventory`.

Evidencia local: `artifacts/service-audit-2026-11-04.md`, ampliada el 7 de noviembre,
excluida de Git. Conciliacion estructurada opcional segun README raiz. No publicar
DSN, tokens, tarjetas, datos fiscales ni exportaciones crudas. Cada factura compartida
se cuenta una vez: DB/Auth o varios buckets no son necesariamente suscripciones separadas.

Antes de cerrar auditoria, cada recurso usado/contratado necesita alias, entorno,
consumidor o justificacion, titular, plan, periodo, cuotas/uso, renovacion o no aplica,
costos fijos/variables y fuente fechada. Desconocidos permanecen pendientes, no cero.
No mezclar monedas ni extrapolar un mes desde unas horas. Revisar semanalmente y antes
de activar una funcion; evidencia vencida no es costo actual confirmado.

**Auditoria financiera abierta**: falta conciliacion por entorno y evidencia de
planes/consumo; las brechas operativas figuran en la comparacion de beta.

## Fuentes externas para reverificacion

- [Cloud Billing: prepago](https://docs.cloud.google.com/billing/docs/how-to/payment-methods#available_payment_methods)
  y [Cloud Run: consumo y cuota gratuita](https://cloud.google.com/run/pricing).
- [Cloudmersive: limites y disponibilidad](https://cloudmersive.com/faq).
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): elegibilidad de uso.
- [Netlify: precios](https://www.netlify.com/pricing/): no aplicar automaticamente
  cuotas de planes nuevos a la cuenta Free Legacy observada.
- [Resend: dominio remitente](https://resend.com/docs/dashboard/domains/introduction).
- [Nominatim: uso](https://operations.osmfoundation.org/policies/nominatim/) y
  [teselas OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
