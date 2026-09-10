# Notifications + alerts v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

No hay canal de alertas ops cuando se emite licencia, confirma pago o
muere un job de outbox (`launch-gates` / backlog).

## Alcance v0.1

1. Puerto `NotificationPort` (`notify` + `listRecent`).
2. Provider `sandbox` (default): JSONL en `.local/notifications/YYYY-MM-DD.jsonl`.
3. Provider `log`: solo `console.info` (útil en worker).
4. Provider `email`: fail-closed (no SMTP en v0.1).
5. Emite alertas ops en:
   - `license.issued`
   - `payment.confirmed`
   - outbox job → `dead`
6. Admin: `GET /v1/admin/notifications/recent?limit=50`.

## Fuera de alcance

Email/SMS real, cola Redis, preferencias de usuario, UI web de inbox.

## STOP

Puerto + hooks + tests PASS; email outbox sandbox PASS
(`docs/NOTIFICATIONS_EMAIL_OUTBOX_V0_1.md`); SMTP real OPEN.

## Cierre IMPLEMENT

`NotificationPort` sandbox/log; hooks payment/license/outbox.dead;
`GET /v1/admin/notifications/recent`. Tests notifications 3/3.
