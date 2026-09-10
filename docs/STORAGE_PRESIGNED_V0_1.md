# Storage presigned GET v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Con `STORAGE_PROVIDER=s3`, `GET /files/:id` sigue leyendo bytes por la API.
Eso escala mal y no aprovecha el object store.

## Alcance v0.1

1. `ObjectStorePort.presignGet?(key, expiresSeconds)` — opcional.
2. `s3Store` emite URL SigV4 query-string (GET, caducidad default 300s,
   máx. 3600s).
3. `localStore` no implementa `presignGet` (sigue streaming por API).
4. `GET files/:id` (authz igual): si hay `presignGet` → `302` a la URL;
   si no → cuerpo como hoy.
5. Runbook local MinIO + ClamAV: `docs/runbooks/storage-s3-clamav-local.md`.

## Fuera de alcance

Presign PUT/multipart, CDN, cambiar defaults CI, live commerce.

## STOP

Tests con URL firmada verificable + file redirect mock; runbook listo.

## Cierre IMPLEMENT

`presignGet` en `s3Store`; `GET files/:id` → 302 si hay presign.
Runbook `docs/runbooks/storage-s3-clamav-local.md`. Tests storage-scan +1.
