# Storage S3 + ClamAV v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

v0.1 sandbox (`docs/STORAGE_SCAN_V0_1.md`) cubre local disk + EICAR.
Faltan puertos opt-in para object store remoto y ClamAV real, sin
activarlos en CI.

## Alcance v0.1

1. `STORAGE_PROVIDER=s3` → `ObjectStorePort` SigV4 + fetch (MinIO/R2 con
   `S3_ENDPOINT`; sin AWS SDK).
2. `MALWARE_SCAN_PROVIDER=clamav` → escaneo INSTREAM a `clamd`
   (`CLAMAV_HOST` / `CLAMAV_PORT`).
3. Defaults CI/local siguen `local` + `sandbox`.
4. `assertConfiguration` exige credenciales/bucket (S3) o host (ClamAV)
   solo cuando el provider está activo.

## Fuera de alcance

Multipart upload. Presigned GET: `docs/STORAGE_PRESIGNED_V0_1.md`.
ClamAV en CI, cambiar defaults del repo, live commerce.

## STOP

Adapters + tests (mock S3/clamd) PASS; CI sin red a S3/ClamAV.

## Cierre IMPLEMENT

`s3Store` (SigV4 + fetch, sin AWS SDK) y `clamavScanner` (INSTREAM).
Defaults CI `local`/`sandbox`. Tests storage-scan 5/5. Env en `.env.example`.
