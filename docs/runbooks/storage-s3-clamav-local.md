# Runbook — Storage S3 (MinIO) + ClamAV local

Ensayo **opt-in** fuera de CI. Defaults del repo siguen `local` + `sandbox`.
Docs: `STORAGE_S3_CLAMAV_V0_1.md`, `STORAGE_PRESIGNED_V0_1.md`.

## 1. MinIO (S3 compatible)

```bash
docker run --rm -d --name rn-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Crea el bucket (consola http://127.0.0.1:9001 o `mc`):

```bash
docker run --rm --network host minio/mc \
  alias set local http://127.0.0.1:9000 minioadmin minioadmin
docker run --rm --network host minio/mc mb local/rightsnet-uploads
```

## 2. ClamAV (clamd)

```bash
docker run --rm -d --name rn-clamav -p 3310:3310 clamav/clamav:stable
```

Espera a que arranque (primera vez descarga firmas; puede tardar minutos).

## 3. `.env` de la API

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=rightsnet-uploads
S3_REGION=us-east-1
S3_ENDPOINT=http://127.0.0.1:9000
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
MALWARE_SCAN_PROVIDER=clamav
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
```

Reinicia `pnpm dev`. Sube un asset file; `GET /api/files/:id` debe
redirigir `302` a MinIO con query `X-Amz-Signature=…`.

## 4. Volver a sandbox

```bash
STORAGE_PROVIDER=local
MALWARE_SCAN_PROVIDER=sandbox
```

Para los contenedores: `docker stop rn-minio rn-clamav`.
