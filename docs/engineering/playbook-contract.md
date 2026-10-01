# Playbook Contract

Status: active
Document type: canonical
Owner: Provider Experience
Last verified: 2026-10-01
Scope: identidad y destinos del recorrido de alojamiento
Source of truth: rutas de tarifas/calendario; tours se rige por su contrato de dominio
Review trigger: cambio de contrato o procedimiento; revisar código y evidencia antes de operar

## Launch accommodation

`launch` is the canonical internal ID for the guided accommodation launch flow. Keep this ID stable for compatibility with existing pages, layout logic, API responses, and client-side redirects.

The legacy alias `launch-accommodation` remains accepted as an inbound URL/query value. New links should not emit the alias.

Canonical launch URLs use:

```text
?playbook=launch&step=<stepId>&flow=create
```

Recommended hotel flow:

```text
create -> content -> location -> images -> subtype -> room-profile -> rate -> conditions -> calendar -> house-rules -> preview
```

Canonical route targets for the commercial launch steps:

```text
rate       -> /rates/plans/manage?playbook=launch&step=rate&flow=create&variantId=<variantId>&productId=<productId>&openDialog=1
conditions -> /rates/plans/<ratePlanId>?playbook=launch&step=conditions&flow=create&variantId=<variantId>
calendar   -> /rates/calendar?playbook=launch&step=calendar&flow=create&variantId=<variantId>&focus=availability
```

The playbook coordinates existing CRUD/workspace routes. It should not introduce standalone pages for tariff conditions or calendar setup; those steps deep-link into the current rates and calendar surfaces.
