# Gates para pasar de sandbox a piloto (AT / DE)

Ninguna casilla se marca por existir una interfaz o un adaptador. Se exige evidencia operativa.
Producción (`APP_ENV=production`) sigue bloqueada por `assertConfiguration()`.

**Gate técnico live commerce L1:** **PASS** (`docs/LIVE_COMMERCE_V0_1.md`) —
código admite livemode solo con `LIVE_COMMERCE_ENABLED=true` + `PAYMENTS_PROVIDER=stripe`.
**No activar el flag** en CI ni en uso diario hasta cerrar gates legales/ops abajo.
No implica clearance legal AT–DE.

Piloto comercial propuesto: **Austria + Alemania** (constitución §5). No implica clearance legal.

| Gate | Estado | Evidencia / siguiente entrega |
|---|---|---|
| Loop económico sandbox | Implementado | Tests DB/navegador; `docs/VERIFICATION.md` |
| Rights Core motor + dual-path | PASS | `docs/RIGHTS_CORE_V0_1.md`, integración 012 |
| Marketplace UX + home | PASS | `docs/MARKETPLACE_UX_V0_1.md` |
| Auth login/refresh + MFA opt-in | PASS | Supabase; `MFA_ENABLED` (CI off) |
| KYC Identity v0.1.1 (port + checks + selfie) | Implementado test/sandbox | `docs/IDENTITY_KYC_V0_1.md`; documento + `require_matching_selfie` en Stripe test; ops adult/age policy pendiente |
| Identity KYC live (técnico) | PASS | `IDENTITY_LIVE_ENABLED`; `docs/IDENTITY_KYC_LIVE_V0_1.md` |
| Editor publish Rights Core AT/DE | Implementado | `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md`; flag `RIGHTS_CORE_PURCHASES` |
| Live commerce L1 (gate técnico) | PASS | `LIVE_COMMERCE_ENABLED` gated; `docs/LIVE_COMMERCE_V0_1.md`; CI off |
| Entidad, países admitidos y jurisdicción | Pendiente fundador/asesoría | Decidir operador y modelo contractual AT/DE |
| Contrato y consentimiento jurídicos | Pendiente | Sustituir DEMO por plantilla aprobada/versionada |
| IVA/fiscalidad/facturas | Pendiente | Diseñar e implementar según entidad y países |
| Relación con activo (review humana) | Sandbox operable v0.1 | Preview evidencia + tests; `docs/ASSET_RELATIONSHIP_REVIEW_V0_1.md`. Ensayo humano founder pendiente |
| Stripe Connect (cobros creador) | Implementado test | Live gated por flag; país cuentas nuevas AT/DE/ES vía location / `CONNECT_DEFAULT_COUNTRY` |
| Orgs buyer AT | PASS | Domicilio `AT\|DE\|ES`; `docs/ORG_BUYERS_AT_V0_1.md`. ES legacy permitido; sin remap |
| Storage y malware scan | PASS opt-in | Sandbox + S3/ClamAV/presign/multipart; `docs/STORAGE_*` |
| Roles DB y RLS | FORCE commerce+campaigns PASS | Bypass default on; `DB_RLS_BYPASS_DEFAULT=false` OPEN |
| KMS/rotación | Rotación local PASS | `docs/SIGNING_KEY_ROTATION_V0_1.md`; KMS remoto OPEN |
| Auditoría resistente a admin | PASS v0.1 | Trigger + JSONL hash-chain `docs/AUDIT_ARCHIVE_V0_1.md`; WORM cloud OPEN |
| Notificaciones y alertas | PASS sandbox + email_outbox + SMTP opt-in | JSONL + outbox; SMTP `docs/NOTIFICATIONS_SMTP_V0_1.md` (CI off) |
| Rate limiting distribuido | PASS v0.1 | Memory default; Redis opt-in `docs/RATE_LIMIT_DISTRIBUTED_V0_1.md` |
| Backups/PITR/restore | Ensayo local PASS | `pnpm db:backup-drill` + runbook; PITR cloud OPEN |
| Despliegue staging y seguridad | PASS higiene + scaffold web/API | Docker/Fly fra + Vercel; host cloud OPEN |
| Prueba Stripe test end-to-end | Ensayo previo PASS; reensayo OPEN | Runbook R1–R5; gaps código PASS (incl. thin/fees). Flag live off por defecto |
| Primera licencia/payout **real** | No iniciado | Solo después de cerrar gates legales + KYC ops + Connect live readiness |

## Checklist piloto AT–DE (sin activar live en producción)

1. Legal: contratos/consentimiento AT+DE revisados por asesoría.
2. KYC: Identity en test (documento + selfie matching) verificado; política de adultez confirmada.
3. Publish: al menos un creador AT o DE con Rights Core publicado en test.
4. Buyer path: org y territorios AT/DE coherentes (cerrar hueco orgs AT).
5. Stripe test: Checkout + Connect + Identity webhooks documentados.
6. Gate técnico `LIVE_COMMERCE_ENABLED` **implementado**; permanece `false` hasta readiness legal/ops del founder.

Activar el flag es decisión operativa del founder tras checklist — **no** sustituye clearance legal.

## Commercial trust — 11 septiembre 2026

Transparencia pública `/trust` implementada y verificada; no cierra gates legales.
El fundador confirma que todavía no existe operador registrado. Datos y decisiones
pendientes en `COMMERCIAL_LAUNCH_HANDOFF.md`, con responsables, entregables y fuentes.
`COMMERCIAL_TRUST_V0_1.md`: checks web focales PASS; typecheck/lint globales con
fallos en backend/tests sin cambios en ese hito, pendientes antes de lanzamiento.

Technical update 2026-09-11: typecheck/lint/build recovered in
`TYPECHECK_RECOVERY_V0_1.md`; five full-suite test failures still OPEN. This supersedes
the global compilation/lint blockers above, not the legal or operational requirements.
