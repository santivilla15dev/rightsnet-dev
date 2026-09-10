# Runbook — ensayo backup / restore (sandbox local)

Doc de alcance: `docs/BACKUP_RESTORE_V0_1.md`.  
Esto **no** acredita PITR cloud ni un RPO/RTO de producción.

## Qué respaldar juntos

| Artefacto | Ruta típica | Si falta… |
|-----------|-------------|-----------|
| Postgres | dump `pg_dump -Fc` | no hay pedidos/licencias |
| Claves firma | `.local/keys/*.pem` (+ `*.pub.pem`) | no se verifican/emiten certificados |
| Uploads | `.local/uploads/` | evidencia/OCR desaparece |
| Audit archive | `.local/audit-archive/` | se pierde la cola hash-chain |

Nunca subir claves privadas a Git ni a CI.

## Ensayo automático DB

Con PostgreSQL local en `:55432`:

```bash
pnpm db:start
node scripts/backup-restore-drill.mjs
```

El script:

1. Hace `pg_dump -Fc` de `rightsnet` → `.local/backups/drill-*.dump`
2. Crea DB `rightsnet_restore_drill`
3. `pg_restore` ahí
4. Comprueba que existen tablas núcleo (`organizations`, `audit_events`, …)
5. Elimina la DB de ensayo (el dump queda en `.local/backups/`)

## Ensayo manual de ficheros

```bash
# Inventario (no copia cifrada — solo checklist)
ls -la .local/keys/*.pem .local/keys/*.pub.pem 2>/dev/null | head
du -sh .local/uploads .local/audit-archive 2>/dev/null
```

Para un restore real de ficheros: restaurar esas carpetas desde el backup
cifrado autorizado **antes** de arrancar API/worker.

## PITR cloud (futuro)

Cuando exista proveedor managed: activar PITR, documentar RPO/RTO medidos
en un ensayo de staging, y enlazar el resultado en `docs/VERIFICATION.md`.
Propuesta de producto (no medido aquí): RPO ≤15 min, RTO ≤4 h.
