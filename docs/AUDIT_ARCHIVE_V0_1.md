# Audit archive WORM-ish v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`audit_events` es append-only en Postgres (trigger), pero un admin/superuser
puede truncar o desactivar triggers. Falta **archivo retenido** fuera de DB
(`launch-gates.md`).

## Alcance v0.1

1. Tras cada `audit()`, append de una línea JSONL a
   `.local/audit-archive/YYYY-MM-DD.jsonl` (o `AUDIT_ARCHIVE_DIR`).
2. Cada línea incluye `prev_hash` + `hash` (SHA-256) → cadena verificable.
3. `verifyAuditArchiveDay(day)` detecta manipulación/truncado.
4. Flag `AUDIT_ARCHIVE_ENABLED` default **true** en sandbox/CI (barato);
   `false` desactiva escritura.
5. Admin: `GET /v1/admin/audit-archive/verify?day=YYYY-MM-DD`.

## Fuera de alcance

Object Lock S3/WORM cloud, firma Ed25519 del archivo, export SIEM,
RLS en `audit_events`.

## STOP

Archive + verify + tests PASS.

## Cierre IMPLEMENT

`appendAuditArchive` en `audit()`; cadena SHA-256 JSONL;
`GET /v1/admin/audit-archive/verify`. Tests audit-archive 2/2.
