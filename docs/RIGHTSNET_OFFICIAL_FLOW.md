# RightsNet — modelo mental oficial

Status: **binding product model** (UX milestone Fase 1).

## Diagrama (dos lados)

```text
                         RIGHTSNET

        CREATOR                         BRAND
           │                              │
        Signup                         Discover
           │                              │
        Profile                         Creator
           │                              │
        Identity                     Configure Use
           │                              │
        Likeness                          │
           │                              │
         Rights                           │
           │                              │
        Pricing                           │
           │                              │
        Consent                           │
           │                              │
         Review                           │
           │                              │
        Approved                          │
           │                              │
        Publish ────────────────→ Marketplace
                                          │
                                     Rights Check
                                ┌─────────┼─────────┐
                              ALLOW    APPROVAL    DENY
                                │         │
                                │      Creator approves
                                └─────┬───┘
                                      │
                                   Contract → Payment → License
                                      │
                                 AI Generation → Output → Verification
```

## Identidad

- **Sin rol permanente** Creator vs Brand: una persona puede tener workspace de marca (org) y de creador.
- Switcher de espacio (org / perfil creador) + crear organización.
- Signup no fija rol exclusivo.

## Fricción

| Superficie | Sin cuenta | Con cuenta (+ org para comprar) |
|------------|------------|----------------------------------|
| Discover, ficha, Configure Use, Rights Check (preview) | Sí | Sí |
| Continuar / contrato / pago | No | Sí |
| Onboarding → application → Approved → Publish → Dashboard | No | Sí (creador) |

Auth en **Continuar** (o al persistir solicitud de aprobación), no al explorar.

## Creator gates

`UNDER_REVIEW` → `/application` · `APPROVED` → publicar (no dashboard) · `PUBLISHED` → `/dashboard`

Onboarding: exactamente 7 pasos (Perfil, Identidad, Likeness, Derechos con editor Rights Core, Precio, Consentimiento, Revisión).

## Pago → Success (Fase 3)

- Totales de checkout: **Licencia** · **Comisión plataforma (incluida)** · **Total** (la fee no se suma encima).
- UI de espera («Confirmando pago…» / «Emitiendo licencia…») mientras hay evento/outbox pendiente — **sin** éxito prematuro.
- `public_token` de licencia: `RN-LIC-YYYY-######` (secuencia por año UTC).
- Success screen: token, creador, campaña, vigencia, territorio, canales + Ver / Descargar / Verificar.
- **Registrar contenido IA** = stub (§22 no implementado).

## Dashboard creador (Fase 4)

- Sidebar: Resumen, Likeness, Reglas, Solicitudes, Licencias, Ingresos, Uso (stub), Ajustes (stub) — anclas `#…`.
- Cards **Nueva solicitud** (¿Por qué me lo piden? + Aprobar/Rechazar) y **Nueva licencia vendida** (neto creador).
- Buyer tras aprobación: copy «{creador} aprobó…» + CTA **Completar licencia**.

## STOP

Sin email/push, sin live commerce, sin §22 Generation/Output real (Verification sí).
