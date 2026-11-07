# Performance Observability Contract

Status: active
Document type: canonical
Owner: Engineering
Last verified: 2026-11-06
Scope: instrumentación y criterios de rendimiento SSR/API
Source of truth: código de instrumentación, logs y mediciones del entorno objetivo
Review trigger: cambio de contrato o procedimiento; revisar código y evidencia antes de operar

Fastt treats performance as a production contract, not as a local-only benchmark.

## Tours: Punto De Continuacion

**Estado al 2026-11-06: rendimiento abierto; diagnostico de politica completado.**
Este apartado se reemplaza con la siguiente verificacion, no se amplía como cronologia.
Engineering mantiene la continuidad; las mediciones siguientes son evidencia local fechada,
no objetivos de servicio ni certificacion de produccion.

- Se instrumentaron guardado, reconstruccion, autorizacion y politica por segmentos.
- Se eliminaron lecturas duplicadas y esperas entre tareas independientes. El refresco sigue
  terminando antes de responder al guardado; no se relajaron permisos ni bloqueos comerciales.
- El perfil de cinco lecturas por lote redujo la mediana de politica de 976 a 809 ms.
  Inspecciones y alcances documentales ahora se leen en paralelo: aproximadamente 480 a 320 ms.
- Nueve planes `EXPLAIN ANALYZE` mostraron ejecucion SQL de 0,05 a 1,92 ms; la consulta minima
  caliente rondo 80 ms y las lecturas parametrizadas, 160 ms desde el cliente. No hubo evidencia
  para agregar indices o contratar mas capacidad. Esto no descarta problemas con mayor volumen.
- Ultimo guardado observado: 4,45 s de servidor, con 2,05 s de persistencia, 0,48 s de
  invalidacion y 1,92 s de resumen. Autorizacion dentro del resumen: 1,08 s. No sumar segmentos
  anidados. Son muestras individuales; no atribuir toda la variacion al ultimo cambio.
- Validacion realizada: 291 pruebas enfocadas, seis de render documental, lint, build y
  comprobacion documental. No equivale a toda la suite ni a una certificacion productiva.

### Retomar En Este Orden

1. **Persistencia del guardado de presentacion:** es el siguiente costo grande, cerca de dos
   segundos. Instrumentar dentro de `saveTourPresentation` y su repositorio antes de modificar
   transacciones. Comparar varias muestras con la misma red, runtime y estado de cache.
2. **Concurrencia SSR:** medir espera real de conexiones bajo carga controlada. El perfil sin
   contencion no aisla la cola del pool; no llamar a toda la diferencia cliente/SQL "espera de pool".
3. **Volver a revision:** medir el recorrido sin guardado por separado, con SSR y transicion
   visible. Se corrigieron los enlaces canonicos, pero este recorrido no esta cerrado.
4. **Produccion:** obtener muestras autenticadas comparables y RUM p75/p95 antes de declarar
   cumplida la meta de rapidez. No extrapolar los tiempos locales con VPN a Vercel.

El caso de prueba es el tour ficticio "PRUEBA - Paseo cultural a pie por La Paz". Verificar su
identidad actual y el destino de la base antes de operar: un servidor temporal no aísla los datos.
No publicar, generar reservas, cambiar precios/cupos ni reintentar un guardado a ciegas.
La ruta anterior de ProtonVPN produjo timeouts; al cambiar de ruta volvio la conexion. Registrar
la red/VPN de cada lote y no desactivar protecciones ni cambiar servicios sin autorizacion.

### Fuentes Para Continuar

- Procedimiento de politica: [Commercial Policy Profiling](#commercial-policy-profiling).
- Capturas locales, ignoradas por Git: `artifacts/performance/request-timings.jsonl`,
  `artifacts/performance/tour-policy-profile-before-documents.json` y
  `artifacts/performance/tour-policy-profile.json`. Pueden no existir en otro checkout;
  regenerarlas con el procedimiento, no tratarlas como evidencia versionada.
- Guardado: `src/pages/api/product/tour-presentation.ts`.
- Resumen: `src/lib/product/productOperationalSurface.ts`.
- Autorizacion: `src/lib/tours/loadTourAuthorization.ts`.
- Politica: `src/lib/commercial-policy/enforcement.ts` y `src/lib/commercial-policy/read.ts`.
- Regresiones: `tests/unit/tour-preparation-diagnostic.test.ts`,
  `tests/unit/commercial-policy-read-concurrency.test.ts` y
  `tests/unit/provider-document-read-concurrency.test.ts`.

No se hizo merge, deploy ni migracion como parte de este diagnostico. Revisar el diff local antes
de continuar: las mejoras aun no quedan certificadas por estar compiladas o presentes en el editor.

## Response Headers

- `Server-Timing`: per-segment server timings for critical SSR/API work.
- `X-Fastt-Cache`: request cache outcome. Values: `hit`, `miss`, `stale`, or `none`.
- `X-Fastt-Cache-Detail`: aggregate cache counters for the request.
- `X-Fastt-Region`: runtime region from `FASTT_REGION`, `VERCEL_REGION`, provider env, or `local`.

## Structured Logs

Route performance logs use JSON and hash sensitive identifiers:

- `userHash`
- `providerHash`
- `productHash`

Do not log raw emails, user IDs, provider IDs, product IDs, tokens, cookies, or full query strings.

## Browser RUM

The base layout reports:

- TTFB
- LCP
- INP
- Astro route transition duration

Events are sent to `/api/internal/observability/rum` with `sendBeacon` when possible.

## Public Lab Measurements

### Per-page register

Generate the private CSV inventory of Astro page routes (not API endpoints):

```bash
node scripts/perf/page-performance-register.mjs
node --test scripts/perf/page-performance-register.test.mjs
node scripts/perf/page-performance-register.mjs artifacts/performance/samples.json
```

Output: `artifacts/performance/page-performance.csv` (ignored by Git). Each route has
separate load/save rows. Unmeasured rows stay pending with blank durations; a save row
does not imply that the page has a save operation. Mark applicability during review.
The script inventories routes and summarizes supplied samples; it does not browse,
authenticate or execute writes. Regeneration replaces the CSV; preserve sample inputs.

Samples are an array with only `route` (template such as `/product/[id]/presentation`),
`phase` (`load` or `save`), `durationMs`, `environment` (`local-dev`, `local-build`,
`preview`, `production`), `cache` (`hit`, `miss`, `stale`, `none`, `unknown`) and
`measuredAt` (ISO timestamp). Never include cookies, tokens, concrete IDs or query strings.
Use load for navigation start to usable destination and save for submission to confirmed
return; keep server segments separately in structured logs. Do not mix TTFB with these
durations or write a lower bound as an exact sample. Percentiles are descriptive of the
provided population, not production certification; review sample count and time window.
Environments and cache populations remain separate. This CSV is a local working artifact,
not a durable certification. Route additions require regeneration.

Presentation saves expose `authProvider`, `persist`, `invalidate`, `surfaceRefresh`,
and `total` in Server-Timing and structured route logs. Inspect these before attributing
a slow save to navigation. A committed write must not be retried just because inspection
failed. Record incomplete observations separately, not as completed timing samples.
Local development without Vercel also appends numeric route timings to the ignored
`artifacts/performance/request-timings.jsonl` with private creation permissions. It omits
URLs, identifiers, request bodies and credentials. This best-effort diagnostic sink is
not production telemetry or an audit trail. Keep its server durations separate from
the CSV's browser load/save durations; archive or remove local captures after analysis.

### Commercial Policy Profiling

For an explicitly selected test offer, run the read-only diagnostic against the configured
runtime database without saving the offer or changing publication gates:

```bash
NODE_ENV=development node --import dotenv/config --import tsx \
  scripts/perf/tour-policy-profile.ts <test-product-id>
```

The script collects five warm connection round trips, five policy reads with fresh operation
scopes, and core lookup plans using `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` inside a
read-only transaction. Inspect cold and warm policy samples separately. Preserve the generated
`artifacts/performance/tour-policy-profile.json` before repeating; it is overwritten on each run.
It contains numeric timings and structural plan summaries, not rows, credentials or query values.

Use `commercial.policy.resolve` logs to locate product, holder, document, operation and enrollment
reads. `commercial.policy.evaluate` separates policy and territory reads from decision CPU time.
Client query duration includes protocol, network and any connection wait; it is not SQL execution
time. Compare it with PostgreSQL planning/execution time before adding indexes or changing compute.
The uncontended diagnostic does not measure queue wait in a concurrent SSR process. Reproduce that
load separately before attributing the difference to pool saturation. Do not use local samples as
production percentiles or proof of commercial readiness.

Run PageSpeed against preview and production URLs:

```bash
FASTT_PERF_URLS="https://preview.example.com/provider/settings,https://fastt.example.com/provider/settings" pnpm run perf:pagespeed
```

Use production URLs for release decisions. Local dev is useful for diagnosis, but not for p75/p95.

## Infrastructure Region Contract

Fastt keeps SSR close to Supabase Postgres. The current primary target is:

- Supabase Postgres: `sa-east-1` / São Paulo.
- Vercel Functions: `gru1`, configured in `vercel.json`.
- Runtime Postgres connection: Supabase transaction pooler through `SUPABASE_DB_POOLER_URL` or `DATABASE_URL`.
- Direct Postgres connection: `DIRECT_URL`, reserved for migrations, imports, exports, validation scripts, and admin one-off jobs.
- Redis/Upstash: choose the region closest to the Vercel function region. For `gru1`, prefer Upstash/AWS `sa-east-1`. If the deployment must fall back to `iad1`, prefer `us-east-1`.

Vercel defaults serverless functions to `iad1` unless a region is configured. `gru1` is the closest compute region to a São Paulo Supabase database. Miami is useful as a network point of reference, but it is not currently a Vercel compute region in the public region list; if the current Vercel plan cannot deploy to `gru1`, compare real measurements between the available Vercel fallback, typically `iad1`, and the database before changing the database region.

### Confirm Runtime Region

Deploy with `FASTT_INFRA_HEALTH_TOKEN` and run:

```bash
FASTT_INFRA_URLS="https://preview.example.com,https://fastt.example.com" \
FASTT_INFRA_HEALTH_TOKEN="..." \
pnpm run perf:infra-region
```

The script calls `/api/internal/observability/infra-region` and reports:

- `region`: actual Vercel/function region from `X-Fastt-Region`.
- `dbMs`: runtime Postgres round-trip.
- `redisMs`: cache round-trip.
- `runtimeUsesPooler`: must be `true` in serverless deployments.
- `cacheConfigured`: confirms Redis/Upstash is active instead of only memory fallback.

### Fallback Comparison

If `gru1` is unavailable, deploy one preview with the closest allowed region and compare against the São Paulo database:

```bash
FASTT_INFRA_URLS="https://preview-gru.example.com,https://preview-iad.example.com" \
FASTT_INFRA_HEALTH_TOKEN="..." \
FASTT_INFRA_ATTEMPTS=10 \
pnpm run perf:infra-region
```

Decision rule:

- Keep the function region closest to Postgres when `dbMs` is materially lower and p95 SSR improves.
- Keep Redis near the function region, because cache calls happen inside SSR/API runtime.
- Do not use `DIRECT_URL` for app runtime; it is only for controlled scripts.
