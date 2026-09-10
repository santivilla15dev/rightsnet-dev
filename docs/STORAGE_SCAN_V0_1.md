# Storage + malware scan v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT PASS (cierre abajo).

## Alcance

Puerto de almacenamiento + escáner malware **sandbox** (default CI):

1. `ObjectStorePort` — put/get en `.local/uploads` (igual que hoy).
2. `MalwareScannerPort` — sandbox: rechaza firma EICAR; resto `clean`
   (tras validación MIME/tamaño del caller).
3. Uploads de evidencia y Existing Deal usan los puertos; ya no marcan
   `clean` a ciegas ni dejan el “scan” solo a la review humana.
4. Submit a review exige al menos un fichero `scan_status=clean`.

Flags (off / local por defecto):

- `STORAGE_PROVIDER=local` (único en v0.1; `s3` documentado como futuro).
- `MALWARE_SCAN_PROVIDER=sandbox` (único en CI; `clamav` futuro).

## Fuera de alcance

S3/R2 real y ClamAV: **PASS** opt-in en `docs/STORAGE_S3_CLAMAV_V0_1.md`
(CI sigue local+sandbox). URLs firmadas, multipart, live commerce.

## STOP

Código + mocks PASS. Storage remoto y ClamAV reales siguen hitos aparte.

## Cierre IMPLEMENT

Puertos `object-store` + `malware-scanner`; uploads evidencia/acuerdos cableados;
submit/review/extract exigen `clean`. Tests `storage-scan` + review actualizado.
