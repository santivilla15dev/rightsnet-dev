# Staging deploy + seguridad v0.1

2026-09-10. SPECIFY PASS; IMPLEMENT abajo.

## Problema

`launch-gates.md` y el backlog piden «Despliegue staging y seguridad»
(región, secretos, HTTPS, CI remoto). No había checklist ni verificación
automática de higiene del repo.

## Alcance v0.1

1. Spec + runbook `docs/runbooks/staging-security-checklist.md`.
2. Script `pnpm staging:security` (`scripts/staging-security-checklist.mjs`)
   con checks de higiene (gitignore, `.env.example`, CI, sin `sk_live_`
   rastreado).
3. Checklist humana impresa (región EU, HTTPS, secretos, entornos aislados).
4. Tests unitarios de los checks.

## Fuera de alcance

Provisionar Vercel/Fly/AWS, DNS, certificados reales, secret stores cloud,
activar live commerce, `APP_ENV=production`, afirmar piloto listo.

## STOP

Higiene repo + runbook PASS; despliegue cloud staging real sigue OPEN.

## Cierre IMPLEMENT

Script + runbook + tests staging-security PASS. `pnpm staging:security`
Hygiene PASS en sandbox local 2026-09-10. Cloud host OPEN.
