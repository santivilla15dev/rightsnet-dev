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

## STOP

Sin email/push, sin live commerce, sin §22 Generation/Output real (Verification sí).
