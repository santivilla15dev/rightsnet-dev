# Notifications SMTP v0.1

2026-09-11. SPECIFY PASS; IMPLEMENT PASS.

## Problema

`NOTIFY_PROVIDER=email` estaba fail-closed. El outbox sandbox
(`email_outbox`) no transmite. Hace falta un camino opt-in SMTP para
alertas ops reales (Mailpit local o SES/SendGrid/SMTP genérico), sin
activar envío en CI.

## Alcance v0.1

1. `NOTIFY_PROVIDER=email` envía correo ops vía SMTP (nodemailer).
2. Env requeridos: `SMTP_HOST`, `SMTP_PORT`; opcionales `SMTP_USER`,
   `SMTP_PASS`, `SMTP_SECURE=true`, `SMTP_FROM` (default = `NOTIFY_OPS_EMAIL`).
3. Destinatario: `NOTIFY_OPS_EMAIL` (default `ops@localhost.invalid`).
4. Sigue escribiendo el JSONL de notificaciones sandbox + fila en
   `email-outbox.jsonl` con `status=sent` o `failed` (auditoría local).
5. `assertConfiguration` exige host/port si provider=`email`; CI default
   sigue `sandbox`.
6. Tests con puerto SMTP inyectado (sin red).

## Uso local (Mailpit)

```bash
# ejemplo: Mailpit en :1025
NOTIFY_PROVIDER=email
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
NOTIFY_OPS_EMAIL=ops@example.test
SMTP_FROM='RightsNet <ops@example.test>'
```

## Fuera de alcance

Plantillas HTML, preferencias de usuario, SMS, cola DB, reintentos
worker, SES SDK dedicado, cambiar default CI.

## STOP

SMTP opt-in PASS; no CI email; no live commerce.

## Cierre IMPLEMENT

`NOTIFY_PROVIDER=email` + nodemailer; assert SMTP_HOST/PORT; outbox
`sent`/`failed`; tests notifications **7/7**; CI default `sandbox`.
