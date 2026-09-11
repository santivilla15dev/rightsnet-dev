# Notifications email outbox sandbox v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`NOTIFY_PROVIDER=email` fallaba cerrado sin un camino intermedio: no se
puede ensayar la forma de un “correo ops” sin SMTP real.

## Alcance v0.1

1. Provider `email_outbox`: escribe la alerta ops como en `sandbox` **y**
   añade una fila a `.local/notifications/email-outbox.jsonl` con
   `to` / `subject` / `text` / `status=sandbox_queued` (nunca se envía).
2. Destinatario: `NOTIFY_OPS_EMAIL` (default `ops@localhost.invalid`).
3. Admin: `GET /v1/admin/notifications/email-outbox?limit=50`.
4. `NOTIFY_PROVIDER=email` (SMTP) → `docs/NOTIFICATIONS_SMTP_V0_1.md` (opt-in).

## Fuera de alcance

SMTP/SES/SendGrid, SMS, plantillas HTML, preferencias de usuario,
entrega real.

## STOP

Outbox sandbox PASS; SMTP real → `docs/NOTIFICATIONS_SMTP_V0_1.md`.

## Cierre IMPLEMENT

`email_outbox` + `GET /v1/admin/notifications/email-outbox`;
`NOTIFY_OPS_EMAIL`; SMTP `email` sigue fail-closed. Tests notifications 4/4.
