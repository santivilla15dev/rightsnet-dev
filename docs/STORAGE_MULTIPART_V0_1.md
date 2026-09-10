# Storage multipart upload v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`s3Store.put` usa un solo PUT. Ficheros mayores (acuerdos ≤10 MiB hoy;
futuro >5 MiB) se benefician de multipart S3.

## Alcance v0.1

1. Métodos opcionales en `ObjectStorePort`:
   - `createMultipartUpload(key)`
   - `uploadPart(key, uploadId, partNumber, bytes)`
   - `completeMultipartUpload(key, uploadId, parts)`
   - `abortMultipartUpload(key, uploadId)`
2. `s3Store` implementa Create/UploadPart/Complete/Abort (SigV4).
3. `put` en S3: si `bytes.length > S3_MULTIPART_THRESHOLD` (default
   5 MiB) usa multipart automáticamente; si no, PUT simple.
4. `localStore` sin multipart (sigue `put` atómico).
5. Tests con `fetch` mock (sin red).

## Fuera de alcance

Subir el CHECK SQL de `asset_files` (2 MiB), UI multipart, presign PUT
por parte, cambiar defaults CI.

## STOP

Adapters + tests PASS; CI local/sandbox intacto.

## Cierre IMPLEMENT

Multipart Create/UploadPart/Complete/Abort en `s3Store`; `put` auto si
supera umbral (default 5 MiB). Tests storage-scan 7/7.
