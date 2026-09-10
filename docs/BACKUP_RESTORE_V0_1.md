# Backup + restore drill v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`launch-gates.md` exige ensayo de restore (DB + ficheros + claves) antes
de live. Solo hay un `pg_dump` de ejemplo en local-operations.

## Alcance v0.1

1. Runbook `docs/runbooks/backup-restore-drill.md` (DB dump/restore,
   keys, uploads, audit-archive; qué **no** es PITR cloud).
2. Script `scripts/backup-restore-drill.mjs`: dump → DB temporal →
   smoke `SELECT` → drop. No toca la DB primaria.
3. Documentar RPO/RTO **propuestos** (no acreditados en cloud).

## Fuera de alcance

PITR managed (RDS/Neon), cifrado offsite, ensayo en staging cloud,
cambiar backups de CI.

## STOP

Script + runbook PASS en sandbox local; gate cloud PITR sigue OPEN.

## Cierre IMPLEMENT

`scripts/backup-restore-drill.mjs` + runbook; ensayo local 2026-09-10
PASS (dump→restore smoke). `pnpm db:backup-drill`. PITR cloud OPEN.
