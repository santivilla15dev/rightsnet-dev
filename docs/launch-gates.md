# Gates para pasar de sandbox a piloto (AT / DE)

Ninguna casilla se marca por existir una interfaz o un adaptador. Se exige evidencia operativa.
Producción y comercio real están bloqueados por `assertConfiguration()`.
**No activar `LIVE_COMMERCE_ENABLED`.**

Piloto comercial propuesto: **Austria + Alemania** (constitución §5). No implica clearance legal.

| Gate | Estado | Evidencia / siguiente entrega |
|---|---|---|
| Loop económico sandbox | Implementado | Tests DB/navegador; `docs/VERIFICATION.md` |
| Rights Core motor + dual-path | PASS | `docs/RIGHTS_CORE_V0_1.md`, integración 012 |
| Marketplace UX + home | PASS | `docs/MARKETPLACE_UX_V0_1.md` |
| Auth login/refresh (sin MFA) | PASS parcial | Supabase v0.1; MFA admin **fuera** del MVP actual (`AGENTS.md`) |
| KYC Identity v0.1.1 (port + checks + selfie) | Implementado test/sandbox | `docs/IDENTITY_KYC_V0_1.md`; documento + `require_matching_selfie` en Stripe test; ops adult/age policy pendiente |
| Editor publish Rights Core AT/DE | Implementado | `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md`; flag `RIGHTS_CORE_PURCHASES` |
| Entidad, países admitidos y jurisdicción | Pendiente fundador/asesoría | Decidir operador y modelo contractual AT/DE |
| Contrato y consentimiento jurídicos | Pendiente | Sustituir DEMO por plantilla aprobada/versionada |
| IVA/fiscalidad/facturas | Pendiente | Diseñar e implementar según entidad y países |
| Relación con activo (review humana) | Sandbox | Evidencia local; validación operativa pendiente |
| Stripe Connect (cobros creador) | Implementado test | Live bloqueado; país Connect aún sesgado a test ES |
| Orgs buyer AT | Hueco | CHECK org country legacy ES\|DE — alinear antes de piloto AT buyers |
| Storage y malware scan | Sandbox local | Disco privado; integrar storage/scanner real |
| Roles DB y RLS | Pendiente | Migrator separado; ensayar tenancy |
| KMS/rotación | Parcial | Ed25519 local; gestión remota pendiente |
| Auditoría resistente a admin | Parcial | Triggers append-only; archivo retenido pendiente |
| Notificaciones y alertas | Pendiente | Email / métricas / cola |
| Rate limiting distribuido | Pendiente | Límite local de una instancia |
| Backups/PITR/restore | Pendiente | Ensayar restore DB + ficheros + claves |
| Despliegue staging y seguridad | Pendiente | Región, secretos, HTTPS, CI remoto |
| Prueba Stripe test end-to-end | Ensayo previo PASS; reensayo abierto | Ver `docs/VERIFICATION.md`. Live no habilitado |
| Primera licencia/payout **real** | No iniciado | Solo después de cerrar gates legales + KYC ops + Connect live readiness |

## Checklist piloto AT–DE (sin live)

1. Legal: contratos/consentimiento AT+DE revisados por asesoría.
2. KYC: Identity en test (documento + selfie matching) verificado; política de adultez confirmada.
3. Publish: al menos un creador AT o DE con Rights Core publicado en test.
4. Buyer path: org y territorios AT/DE coherentes (cerrar hueco orgs AT).
5. Stripe test: Checkout + Connect + Identity webhooks documentados.
6. `LIVE_COMMERCE_ENABLED` permanece `false` hasta gate de readiness dedicado.

El guard de código debe sustituirse por una política de readiness verificada en una entrega específica — **no** por activar el flag a mano.
