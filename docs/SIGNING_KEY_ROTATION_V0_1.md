# Signing key rotation v0.1 (local → KMS-ready)

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

Las claves Ed25519 viven en `.local/keys` sin rotación documentada.
`launch-gates.md` marca KMS/rotación como parcial.

## Alcance v0.1

1. Puerto `SigningKeyStore` (local filesystem = comportamiento actual).
2. `rotate(purpose)` para `license` y `rn-auth`:
   - archiva el private activo (`*.pem.rotated-<iso>`);
   - crea nuevo par; escribe `kid.pub.pem`;
   - **no** borra pubs históricos → verify de firmas viejas sigue OK.
3. `SIGNING_PROVIDER=local` (default CI). `aws_kms` / remoto: fail-closed
   documentado, no implementado.
4. Admin: `POST /v1/admin/signing-keys/rotate` `{ purpose }` → nuevo `key_id`.
5. Tests: firmar → rotar → firma nueva con kid nuevo; firma vieja sigue
   verificando.

## Fuera de alcance

AWS/GCP/Vault KMS real, HSM, rotación automática por TTL, re-firmar
licencias históricas.

## STOP

Rotación local + tests PASS; gate KMS remoto sigue abierto.

## Cierre IMPLEMENT

`SigningKeyStore` local + `POST /v1/admin/signing-keys/rotate` +
`GET /v1/admin/signing-keys`. Tests `signing-rotation` 3/3 + domain/rn-auth.
`SIGNING_PROVIDER` ≠ local falla en assertConfiguration.
