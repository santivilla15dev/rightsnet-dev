# Backlog abierto — RightsNet (para Codex / agentes)

**Fecha:** 10 septiembre 2026  
**Fuentes de verdad:** `AGENTS.md`, `docs/RIGHTSNET_MVP_CONSTITUTION.md`, `docs/launch-gates.md`, `docs/VERIFICATION.md`, `docs/LIVE_COMMERCE_V0_1.md`.

Este documento lista lo que **aún falta**. No reabrir hitos ya **PASS**. Un hito a la vez.

---

## 1. Instrucciones para Codex

1. Leer `AGENTS.md` y `docs/RIGHTSNET_MVP_CONSTITUTION.md` antes de implementar.
2. Flujo: **SPECIFY → IMPLEMENT → MIGRATE → TEST → RUN → VERIFY → DOCUMENT → STOP**.
3. Un solo hito por entrega; no abrir voz / music / agents / API pública developer en paralelo sin decisión explícita del founder.
4. **No** poner `APP_ENV=production` (sigue bloqueado en `assertConfiguration`).
5. **No** activar en CI: `LIVE_COMMERCE_ENABLED`, `IDENTITY_LIVE_ENABLED`, `MFA_ENABLED` (defaults off).
6. **No** afirmar clearance legal AT–DE ni “piloto listo”.
7. **No** remapear masivamente territorios históricos ES → AT ni reutilizar schema incompatible.
8. RightsNet Connect (`/v1/platform/*`) ≠ Stripe Connect; partner-gated con `PLATFORM_API_ENABLED`.
9. Preservar snapshots históricos (licencia, policy, consentimiento, contrato, financieros).
10. El founder elige el siguiente ítem de la §4; Codex no inventa el siguiente roadmap.

---

## 2. Ya PASS (no rehacer)

| Área | Notas / doc |
|------|-------------|
| Rights Core motor + dual-path compra | `docs/RIGHTS_CORE_V0_1.md` |
| Auth Supabase v0.2 (email + Google/Apple, cuenta dual) | runbook auth-supabase |
| Auth MFA v0.1 TOTP (`MFA_ENABLED`, CI off) | `docs/AUTH_MFA_V0_1.md` |
| Home pública + E2E §28 | `docs/HOME_AND_E2E_V0_1.md` |
| Marketplace UX v0.1 | `docs/MARKETPLACE_UX_V0_1.md` |
| Identity KYC v0.1 / v0.1.1 (sandbox + Stripe test + selfie) | `docs/IDENTITY_KYC_V0_1.md` |
| Identity KYC live gate (`IDENTITY_LIVE_ENABLED`) | `docs/IDENTITY_KYC_LIVE_V0_1.md` |
| Creator publish Rights Core AT/DE | `docs/CREATOR_PUBLISH_RIGHTS_CORE_V0_1.md` |
| Flujo oficial buyer/creator | `docs/RIGHTSNET_OFFICIAL_FLOW.md` |
| RightsNet Connect partner + check / authorize | `docs/RIGHTSNET_CONNECT_V0_1.md` |
| RN-AUTH mint / verify / revoke / list | docs `RN_AUTH_*` |
| `report_output` + GenerationRecord + list/GET + verify público | docs `REPORT_OUTPUT_*`, `GENERATION_*` |
| Higgsfield adapter sandbox + live L1–L3 (CI mock) | `docs/HIGGSFIELD_*` |
| RightsGrant marketplace + Existing Deal (OCR, bulk CSV/confirm) | docs `RIGHTS_GRANT_*`, `EXISTING_DEAL_*` |
| Rights Operations API + UI + org-member + pending CTA | docs `RIGHTS_OPERATIONS_*` |
| **Live commerce L1 técnico** (`LIVE_COMMERCE_ENABLED`, CI off) | `docs/LIVE_COMMERCE_V0_1.md` |
| Doc truth-sync | `docs/DOC_TRUTH_SYNC_V0_1.md` |
| **Campaigns H1–H6** (plan → passport) | docs `CAMPAIGNS_*` … `CAMPAIGN_PASSPORT_*` |
| **Org buyers AT** (domicilio AT\|DE\|ES) | `docs/ORG_BUYERS_AT_V0_1.md` |

Stripe Checkout / Connect / refunds / money / recon: mocks **PASS**; ensayo test externo previo **PASS** con reensayo abierto (ver §4).

---

## 3. Pendiente — founder / asesoría (no es solo ticket de código)

Estos bloquean “piloto comercial real”, no el desarrollo diario en sandbox/test.

| Ítem | Qué falta |
|------|-----------|
| Entidad, países admitidos, jurisdicción | Decidir operador y modelo contractual AT/DE |
| Contrato y consentimiento jurídicos | Sustituir plantillas **DEMO** por textos aprobados/versionados |
| IVA / fiscalidad / facturas | Diseñar e implementar según entidad y países |
| Activar flags live en entorno founder | Solo tras checklist en `docs/launch-gates.md`; no sustituye clearance legal |
| Política ops adult/age (Identity) | Confirmación operativa de adultez / edad (más allá del port técnico) |
| Primera licencia / payout **real** | Solo después de legales + KYC ops + Connect live readiness |

Legal puede hacerse **después**; mientras tanto seguir producto con `LIVE_COMMERCE_ENABLED=false` y claves test.

---

## 4. Pendiente — producto / ingeniería (candidatos de próximo hito)

El founder elige **uno**. Cada fila es un posible SPECIFY → STOP.

| Prioridad sugerida | Ítem | Detalle |
|--------------------|------|---------|
| Alta (piloto AT) | Connect país sesgado a test **ES** | Alinear onboarding Connect con alcance AT/DE cuando toque |
| Media | Review humana relación con activo | Sandbox hoy; validación operativa pendiente |
| Media | Stripe test **reensayo** + gaps money/recon | Ver `docs/VERIFICATION.md`: thin v2 recovery, reversión parcial/paginada, asociación tardía transfers, fees/cuentas connected, límite 500 movimientos |
| Media | Storage real + malware scan | Hoy disco privado local |
| Media | Roles DB / RLS | Migrator separado; ensayar tenancy |
| Baja / infra | KMS / rotación remota | Hoy Ed25519 local |
| Baja / infra | Auditoría resistente a admin | Triggers append-only; archivo retenido pendiente |
| Baja / infra | Notificaciones y alertas | Email / métricas / cola |
| Baja / infra | Rate limiting distribuido | Hoy límite local de una instancia |
| Baja / infra | Backups / PITR / restore | Ensayar restore DB + ficheros + claves |
| Baja / infra | Despliegue staging y seguridad | Región, secretos, HTTPS, CI remoto |

Plantillas legales cableadas en producto: solo cuando §3 entregue textos aprobados (hito aparte).

---

## 5. Fuera de alcance hasta decisión explícita del founder

- Voz, music, agents  
- API pública tipo developer platform (Connect partner sigue gated)  
- Remap masivo ES → AT de grants históricos  
- `APP_ENV=production`  
- Afirmar “piloto legal AT–DE listo” o clearance IVA/contratos  
- Activar `LIVE_COMMERCE_ENABLED` en CI o como default del repo  

---

## 6. Cómo elegir el siguiente hito

1. Founder apunta un ítem de la **§4** (o un entregable de §3 si ya hay textos legales).  
2. Codex: SPECIFY (`docs/…_V0_1.md`) → IMPLEMENT → TEST → DOCUMENT (`AGENTS.md` / `VERIFICATION.md` / `launch-gates.md` si aplica) → **STOP**.  
3. No encadenar el siguiente hito en la misma entrega.

Checklist piloto AT–DE (referencia): `docs/launch-gates.md`.
