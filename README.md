# RightsNet

MVP local de licencias de likeness para publicidad con IA. Incluye marketplace, políticas y consentimientos versionados, aprobación manual, contrato de prueba, checkout simulado, ledger de doble partida y certificados Ed25519 verificables.

**Estado: sandbox funcional. No procesa dinero real ni concede derechos jurídicos.** Los perfiles son ficticios e ilustrados. El onboarding, las verificaciones y las transferencias del modo sandbox son simulaciones explícitas. La activación de producción está bloqueada en código.

## Arranque

Requisitos: Node 22.20+ compatible, pnpm 10.29.3 y PostgreSQL 16. En este Mac se ha preparado una instancia aislada en el puerto 55432, sin modificar el PostgreSQL que ya estaba ejecutándose en 5432.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abrir [RightsNet local](http://127.0.0.1:3000). API: `http://127.0.0.1:4000/v1/health`.

`pnpm dev` carga el `.env` del repo (si existe), inicia PostgreSQL local cuando no hay `DATABASE_URL` (o reutiliza el que ya escucha en 55432), aplica migraciones y fixtures idempotentes, y arranca Next.js, NestJS y el worker. Datos y claves locales en `.local/`, fuera de Git. Para otro path de PostgreSQL: `POSTGRES_BIN=/ruta/bin pnpm dev`.

Con Docker o un servidor PostgreSQL existente:

```bash
docker compose up -d
export DATABASE_URL=postgresql://rightsnet:local-rightsnet-only@127.0.0.1:55432/rightsnet
pnpm dev
```

No arrancar Docker en 55432 si la instancia local ya ocupa ese puerto. No conectar este sandbox a una base existente con datos ajenos.

## Recorrido de prueba

1. Entra como **marca** desde `/login`.
2. En `/discover`, elige **Lucía Martín**. Configura una campaña de belleza para ES, Instagram, 30 días e inicio dentro de tres días.
3. Comprueba los derechos, revisa y acepta el documento DEMO.
4. Continúa al checkout y simula pago correcto o rechazado. Tras confirmar, el worker emite una licencia firmada.
5. Descarga su JSON y abre la verificación pública. Se mostrará **Programada** hasta la fecha de inicio; no es un error.
6. Cambia a **creador** para modificar/versionar políticas, registrar consentimiento y aprobar solicitudes.
7. En **administración**, revisa órdenes, ledger, auditoría, suspensiones y reembolsos.
8. Usa **Crear un perfil desde cero** para probar alta, carga de evidencia PNG/JPEG, verificación simulada, consentimiento, revisión administrativa y publicación. Mantén esa sesión en una pestaña/contexto separado si necesitas cambiar a administración: el acceso nuevo es efímero y no tiene contraseña recuperable.

Una cuenta **solo lectura** puede consultar su organización pero no comprar. Las API rechazan también acceso cruzado entre organizaciones. El sandbox tiene accesos administrativos públicos solo en loopback: no publicarlo en Internet.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Con web/API/worker ejecutándose:
pnpm exec playwright install chromium
pnpm test:e2e --max-failures=1
```

Los tests de dominio e integración usan otra base, `rightsnet_test`. `TEST_DATABASE_URL` debe terminar en `_test`. No borran la base de desarrollo. Las pruebas de navegador crean campañas DEMO en desarrollo y conservan su auditoría; no se borran evidencias para limpiar contadores.

- [Informe de verificación](docs/VERIFICATION.md)
- [Contrato API OpenAPI](packages/contracts/openapi.json) y [tipos generados](packages/contracts/api.d.ts)
- `pnpm contracts` regenera contrato y tipos desde schemas de dominio e inventario de controllers.
- [Decisiones de arquitectura](docs/adr/001-sandbox.md)
- [Gates de lanzamiento](docs/launch-gates.md)
- [Runbook operativo](docs/runbooks/local-operations.md)
- [Brief de referencia](docs/RIGHTSNET_MASTER_DEVELOPMENT_BRIEF.md)

## Arquitectura implementada

- **Next.js 16 / React 19**, Tailwind y primitivas UI propias basadas en el patrón shadcn; diseño responsive.
- **NestJS 12**, módulos de identidad, marketplace, licencias y pagos.
- **PostgreSQL 16**, SQL versionado, FKs, locks, registros append-only, snapshots protegidos y balances mediante constraint triggers diferidos.
- **Worker del mismo monolito**: eventos de pago, reintentos de emisión y outbox. No Redis ni microservicios.
- **Ed25519**: firma de JSON canónico; verificación de integridad y estado temporal. El PDF se obtiene mediante impresión de la página de certificado; el JSON firmado es el artefacto de referencia.
- **Auth sandbox**: tokens opacos aleatorios, hashes en DB, cookie HttpOnly y validación de origen. No es un proveedor de identidad real.

El código permite validar un token Supabase con `AUTH_PROVIDER=supabase` y `SUPABASE_URL` / `SUPABASE_ANON_KEY`; requiere aprovisionar usuarios y completar login/refresh/MFA antes de uso real. No existe aún un onboarding completo de Supabase en esta entrega.

El adaptador `PAYMENTS_PROVIDER=stripe` crea Checkout con claves **test** y valida webhooks firmados. Requiere cuenta conectada test y configuración externa. No se ha probado contra Stripe sin credenciales. Reembolsos, payouts y conciliación externa de Stripe deben completarse antes de adoptar ese adaptador para un piloto operativo; los flujos locales de esas operaciones funcionan en sandbox.

## Qué falta para operar de verdad

Plantilla jurídica aprobada, entidad/jurisdicción/fiscalidad, KYC real y revisión de derechos, Auth/MFA real, Connect onboarding y conciliación completa, storage administrado y análisis antimalware, secretos/KMS, roles DB restringidos, notificaciones y monitorización, backups/restore y despliegue staging. Consulta los gates detallados: **no se declara M6 completado**.

No hay generación de contenido, clonación de voz, música, MCP, negociación, entrenamiento ni royalties por consumo. Pertenecen al roadmap.
