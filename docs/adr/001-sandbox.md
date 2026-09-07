# ADR 001 — Sandbox ejecutable antes de conectar servicios reales

Estado: aceptado para desarrollo, 2026-09-06.

La carpeta original contenía únicamente el brief. La instrucción posterior del usuario autorizó construir todo el MVP, superando la restricción inicial de ejecutar solo M1. Se implementó el recorrido transversal local antes de servicios externos.

## Decisiones

1. PostgreSQL 16 aislado en 55432. No SQLite, no almacenamiento del negocio en localStorage. Migraciones compatibles con PostgreSQL administrado.
2. Monolito NestJS y worker con PostgreSQL compartido; Next.js separado con proxy same-origin y cookies HttpOnly. API enlazada a loopback.
3. Auth de prueba explícita. Adaptador Supabase verifica bearer tokens, pero provisioning/refresh/MFA y UI de login real siguen pendientes. Rechazo de `APP_ENV=production` y `LIVE_COMMERCE_ENABLED=true`.
4. Pago sandbox persistido como evento, seguido de ledger y emisión en worker. El adaptador Stripe solo acepta claves test; no atribuirle validación externa no realizada.
5. Ofertas embebidas en políticas inmutables para 30/90 días; no hay tabla separada de ofertas en este corte. Quotes congelan importe y uso. Contrato DEMO y aceptación previos al checkout.
6. Verificación y ficheros: evidencia en disco local privado, cabecera/mime/tamaño revisados y revisión simulada. Esto no es antimalware ni KYC real. Las semillas ilustradas tienen verificación simulada explícita.
7. Firma Ed25519 de JSON con claves locales persistentes, identificador por hash y claves públicas históricas. No equivale a KMS, W3C VC o prueba de titularidad. Migrar claves a KMS antes de staging sensible.
8. Tabla de journals/entries con equilibrio diferido, inmutabilidad y cierre por transacción. Transacción con lock de orden e idempotencia por actor/ruta/key. El rol local es propietario para migraciones; la separación de roles es gate de producción.
9. UX de datos honestos: no cifras ficticias de royalties, no imágenes de personas reales presentadas como licensors. Seis ilustraciones SVG originales como fixtures.
10. OpenAPI derivado de inventario de rutas y schemas de dominio. Las respuestas administrativas son agregados extensibles; formalizarlas antes de API de terceros. No se anuncia API comercial.

## Diferencias frente al brief completo

No se han conectado Supabase, storage administrado, KYC, facturación, notificaciones ni infraestructura cloud. No hay panel de payouts bancarios, exportador PDF servidor, restore ensayado, rate limiting distribuido ni auditoría WORM. La revisión local de uploads no valida malware. El ciclo automático de emisión usa locks transaccionales y SKIP LOCKED para trabajos pequeños; un proveedor KMS remoto necesitará leases, sin mantener locks durante llamadas de red.

M1–M5 están representados por un recorrido sandbox; no equivalen a todos los requisitos operativos de esos milestones para live. M6 permanece bloqueado por los gates descritos.
