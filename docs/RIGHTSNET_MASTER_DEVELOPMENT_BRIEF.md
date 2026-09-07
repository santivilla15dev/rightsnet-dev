# RIGHTSNET — MASTER DEVELOPMENT BRIEF FOR GPT-6 ASTRA

Versión 0.1 · 6 de septiembre de 2026 · Especificación de construcción por etapas

## 1. Mandato

Construye RightsNet como infraestructura para licenciar el likeness de creadores adultos para publicidad generada con IA. El primer producto debe completar este recorrido: creador identificado → vínculo con su likeness revisado → consentimiento y política versionados → oferta publicada → comprador autorizado → uso evaluado → términos aceptados → pago confirmado → licencia verificable → liquidación registrada.

Este documento es una especificación de producto e ingeniería, no un contrato jurídico ni una declaración de que existen integraciones operativas. Las decisiones marcadas como propuestas permiten desarrollar en sandbox; los bloqueos de lanzamiento impiden transacciones reales hasta resolverse.

**Regla de ejecución:** implementa un solo milestone por encargo. Si recibes únicamente este brief para comenzar, ejecuta M1. No avances automáticamente a todos los milestones ni presentes una demo como infraestructura lista para producción. Cada entrega incluye código, validación, instrucciones reproducibles, limitaciones y próximo paso.

## 2. Scope obligatorio

### MVP incluido

- Personas adultas que licencian su propio likeness; revisión humana del vínculo entre identidad y material aportado.
- Compradores empresariales: marcas y agencias. En el piloto, la entidad compradora es también el anunciante; representar a terceros requiere otro flujo y queda fuera.
- Imágenes y vídeos publicitarios sintéticos, sin clonación de voz.
- Una campaña, un creador y una licencia por compra; sin carrito multivendedor.
- Licencia no exclusiva, sin sublicencia, entrenamiento ni fine-tuning.
- Categorías iniciales propuestas: beauty, lifestyle y fashion; reglas de producto y del creador aplicadas conjuntamente.
- Instagram, TikTok y YouTube; territorios explícitos; EUR; paquetes de 30 o 90 días.
- Precio fijado por el creador por paquete. Aprobación automática o manual de la solicitud, según política.
- Marketplace, panel creador, panel comprador, administración mínima, pagos, recibos contractuales, certificado y verificación.
- Registro de incidentes, suspensión de nuevas ventas y tramitación manual de disputas/reembolsos.

### Fuera del MVP

Voz, música, marcas/personajes, menores, managers, negociación, exclusividad, licencias transferibles, pago autónomo por agentes, MCP, API comercial para terceros, API keys, webhooks salientes a clientes, búsqueda semántica, generación de contenido, C2PA, credenciales W3C, royalties variables, medición de impresiones, apps móviles, blockchain y multimoneda.

La API interna versionada sí existe desde M1. No crear módulos vacíos para funcionalidades del roadmap. No inferir edad, etnia, salud o identidad a partir de fotografías. La búsqueda utiliza atributos declarados y consentidos; el piloto no necesita filtros demográficos.

## 3. Hipótesis comercial y decisiones pendientes

Hipótesis: una marca pagará por un permiso de likeness claro y trazable para publicidad AI. El éxito comercial se mide con licencias pagadas, creadores liquidados y compradores que repiten; el número de perfiles y agencias es una señal de adquisición, no prueba de demanda.

Propuesta de piloto: creadores hispanohablantes, empresas previamente admitidas, interfaz en español y territorios de explotación ES y DE. Los territorios publicitarios no determinan la jurisdicción del contrato ni la residencia fiscal de las partes.

| Decisión | Propuesta para sandbox | Responsable / gate real |
|---|---|---|
| Entidad operadora y países de las partes | Fixtures ES/DE; sin entidad ficticia en producción | Fundador + asesoría, antes de live |
| Modelo contractual y posición de la plataforma | Licencia directa creador-comprador facilitada por RightsNet | Asesoría especializada, antes de live |
| Plantilla, consentimiento, terminación y reclamaciones | Documento DEMO, sin validez comercial prometida | Asesoría especializada, antes de live |
| Comisión | 15% sobre importe de licencia antes de impuestos, retenida al creador | Fundador; versionada por orden |
| Impuestos y facturación | Cálculo desactivado y etiquetado como sandbox | Asesoría fiscal + implementación, antes de live |
| KYC y verificación del vínculo | Adaptador fake solo en desarrollo; proceso de revisión definido | Proveedor + operaciones, antes de publicar perfiles reales |
| Elegibilidad Stripe Connect | Test mode | Confirmar países, actividad y configuración antes de live |
| Retención de evidencias y borrado | Política configurable, sin conservación indefinida por defecto | Responsable de privacidad, antes de datos reales |

Astra puede construir todo el recorrido con fixtures sin esperar estas decisiones. Mantener `LIVE_COMMERCE_ENABLED=false` hasta acreditar los gates en `docs/launch-gates.md`. No inventar un contrato aprobado, asesoramiento recibido, KYC completado ni condiciones fiscales.

## 4. Arquitectura decidida

Monorepo pnpm, TypeScript estricto. Frontend Next.js App Router, React, Tailwind y shadcn/ui. Backend NestJS como monolito modular. PostgreSQL administrado por Supabase; Supabase Auth para autenticación; Supabase Storage privado para ficheros. Migraciones SQL explícitas con una única herramienta de migración; consultas parametrizadas con `pg` y repositorios tipados. Evitar dos autoridades de migración.

Worker NestJS del mismo código para eventos, certificados y conciliación. Cola duradera inicial en PostgreSQL mediante outbox y leases; Redis no es necesario para el piloto. No construir gateway separado: proxy HTTPS hacia la API. Reglas de dominio en un paquete sin dependencias de framework.

Ningún LLM es necesario para completar el MVP. Los modelos y proveedores del roadmap serán configurables; no asumir que el nombre de un modelo disponible en Codex corresponde a un identificador de API.

Seleccionar versiones estables soportadas al iniciar M1, consultar documentación oficial, fijar runtime/package manager y lockfile. No usar `latest` en CI ni adoptar versiones preview por copiar un ejemplo.

```text
rightsnet/
  apps/
    web/src/app/
      (public)/discover/
      (public)/creators/[id]/
      (public)/verify/[token]/
      (auth)/login/
      dashboard/                 # creador
      company/                   # comprador
      admin/
    api/src/
      modules/
        auth/ organizations/ creators/ verification/
        assets/ policies/ offers/ marketplace/
        requests/ contracts/ orders/ payments/
        licenses/ ledger/ incidents/ audit/
      integrations/stripe/ identity/ storage/ email/ signing/
      common/                    # guards, errores, validación
    worker/src/
  packages/
    domain/src/                  # policy engine, pricing, estados
    contracts/                   # OpenAPI 3.1 + tipos generados
    db/migrations/
    db/seeds/
    ui/src/
    config/
  tests/integration/
  tests/e2e/
  infra/docker/
  docs/adr/
  docs/runbooks/
  docs/launch-gates.md
  .github/workflows/ci.yml
  .env.example
  pnpm-workspace.yaml
```

El navegador no escribe tablas de negocio directamente. La API valida el token de Supabase, deriva el usuario y consulta su membership actual para cada operación. Nunca confiar en un `organization_id` enviado sin autorización ni en roles editables por el usuario. Las comprobaciones también se aplican a Server Actions; proteger solo páginas no basta. [Next.js: autenticación](https://nextjs.org/docs/app/guides/authentication), [Supabase: autenticación SSR](https://supabase.com/docs/guides/auth/server-side).

## 5. Roles y superficies

Una persona puede ser creador y miembro de una empresa. Roles por organización: `owner`, `buyer`, `viewer`. Administradores se asignan mediante operación interna auditada; MFA obligatorio para administración y cambios de cobro.

| Actor | Puede | No puede |
|---|---|---|
| Público | Ver perfiles publicados y certificados públicos mínimos | Ver KYC, ingresos, contratos o material privado |
| Creador | Editar borradores propios, publicar versiones revisadas, aprobar solicitudes, ver liquidaciones | Aprobar su propia verificación o alterar licencias emitidas |
| Buyer/owner | Solicitar y comprar para su organización | Acceder a órdenes de otra organización |
| Viewer | Consultar licencias de su organización | Comprar o modificar miembros |
| Admin | Revisar evidencias, suspender ventas, tramitar incidentes motivados | Modificar silenciosamente consentimiento, asientos o contratos |

### UI requerida

- `/`: propuesta concreta y accesos a descubrir/registrarse, sin métricas ficticias.
- `/discover`: filtros idioma, categoría, territorio, canal, duración y precio; estados vacío, carga y error; solo ofertas publicables.
- `/creators/[id]`: perfil, previews, derechos concedidos, restricciones, precio del paquete, vigencia y botón configurar uso.
- `/dashboard`: onboarding y estado de cada verificación; política en lenguaje claro; vista previa antes de consentir; solicitudes; licencias; ingresos distinguiendo pagado, transferido y payout.
- `/company`: datos empresariales y revisión; solicitudes; detalle de checkout; licencias; contratos y justificantes accesibles.
- `/admin`: revisión de identidad/vínculo, compradores, contenidos, incidentes, órdenes bloqueadas y conciliación.
- `/verify/[token]`: estado, fecha de consulta, fechas UTC, identificador público, resumen de alcance y evidencia de firma. No exponer email, documentos, importes o nombres legales privados.

Diseño sobrio, responsive, navegación por teclado, etiquetas accesibles y foco visible. Formularios muestran restricciones antes del pago. Los errores de elegibilidad explican qué dimensión falla. Nunca mostrar “derechos garantizados” o “100% legal”. Un badge distingue identidad verificada de vínculo revisado.

## 6. Modelo relacional y migraciones

Todos los IDs internos son UUID; fechas `timestamptz` UTC; dinero `bigint` en céntimos; moneda ISO; ratios en puntos básicos. Los importes de API son enteros seguros y se rechazan si exceden límites representables. No usar floats monetarios.

El siguiente contrato define tablas, claves y relaciones que deben materializarse como SQL versionado en M1–M5. No se deben crear todas en M1. `id` implica PK UUID; cada tabla mutable tiene `created_at`, `updated_at` y `row_version` para control optimista. Tablas de snapshots y eventos no tienen actualización ordinaria.

| Tabla | Columnas esenciales, relaciones y restricciones |
|---|---|
| users | id = subject Auth, status, created_at; sin duplicar contraseñas |
| organizations | id, legal_name, country, business_status, billing_details_private |
| organization_members | organization_id FK, user_id FK, role; PK compuesta |
| creator_profiles | id, user_id FK UNIQUE, display_name, bio, languages[], adult_check_status |
| identity_checks | id, creator_id FK, provider, provider_ref UNIQUE, status, checked_at, expires_at; sin documento bruto |
| assets | id, creator_id FK, kind CHECK digital_likeness, status, current_policy_version_id nullable |
| asset_versions | id, asset_id FK, version, metadata JSONB; UNIQUE(asset_id,version) |
| asset_files | id, asset_version_id FK, storage_key UNIQUE, sha256, mime_type, size_bytes, scan_status, visibility |
| relationship_reviews | id, asset_version_id FK, reviewer_user_id FK, evidence_ref, decision, reason, reviewed_at |
| policy_versions | id, asset_id FK, version, schema_version, payload JSONB, sha256; UNIQUE(asset_id,version), UNIQUE(asset_id,id) |
| consent_receipts | id, creator_id FK, policy_version_id FK, template_version_id FK, accepted_at, document_hash, evidence_ref; append-only |
| contract_templates | id, version, locale, status demo/approved/retired, document_key, sha256; UNIQUE(version,locale) |
| offers | id, asset_id FK, policy_version_id FK, version, duration_days, price_minor, currency, status; snapshot inmutable una vez publicado |
| license_requests | id, organization_id FK, asset_id FK, policy_version_id FK, usage JSONB, usage_hash, decision, reason_codes JSONB, status |
| request_approvals | id, request_id FK, actor_user_id FK, usage_hash, policy_hash, decision, expires_at; append-only |
| quotes | id, request_id FK, offer_id FK, scope_snapshot JSONB, price_snapshot JSONB, policy_hash, expires_at; inmutable |
| orders | id, quote_id FK UNIQUE, organization_id FK, status, total_minor, currency, stripe_account_ref, fee_bps |
| contracts | id, order_id FK UNIQUE, template_id FK, rendered_document_key, document_hash, terms_snapshot JSONB; inmutable |
| contract_acceptances | id, contract_id FK, user_id FK, organization_id FK, document_hash, accepted_at, evidence_ref; append-only |
| payment_attempts | id, order_id FK, provider_session_id UNIQUE, provider_payment_intent_id UNIQUE nullable, amount_minor, currency, status |
| licenses | id, order_id FK UNIQUE, public_token UNIQUE, starts_at, ends_at, scope_snapshot JSONB, contract_hash, certificate_payload JSONB, signing_key_id, signature, status |
| license_status_events | id, license_id FK, old_status, new_status, actor_ref, reason, effective_at; append-only |
| provider_events | id, provider, provider_event_id, payload_private, status, attempts, available_at, lease_until; UNIQUE(provider,provider_event_id) |
| outbox_events | id, aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, lease_until |
| idempotency_records | actor_scope, method, route, key, request_hash, response_status, response_body, expires_at; PK(actor_scope,method,route,key) |
| ledger_accounts | id, account_code, owner_ref, currency; UNIQUE(account_code,owner_ref,currency) |
| ledger_journals | id, source_type, source_id, event_kind, reversal_of nullable FK; UNIQUE(source_type,source_id,event_kind) |
| ledger_entries | id, journal_id FK, account_id FK, side debit/credit, amount_minor CHECK >0 |
| refunds | id, order_id FK, provider_ref UNIQUE nullable, amount_minor, reason, status |
| disputes | id, order_id FK, provider_ref UNIQUE, status, amount_minor, evidence_due_at |
| payout_records | id, connected_account_ref, provider_payout_id UNIQUE, amount_minor, currency, status, expected_arrival |
| incidents | id, asset_id FK nullable, license_id FK nullable, reporter_user_id FK nullable, category, status, private_details |
| audit_events | id, actor_ref, organization_id nullable, action, resource_type, resource_id, evidence_hash, request_id, occurred_at; append-only |

SQL mínimo de invariantes (además de FKs y NOT NULL):

```sql
ALTER TABLE offers ADD CONSTRAINT offer_price_positive CHECK (price_minor > 0);
ALTER TABLE offers ADD CONSTRAINT offer_currency CHECK (currency = 'EUR');
ALTER TABLE offers ADD CONSTRAINT offer_duration CHECK (duration_days IN (30, 90));
ALTER TABLE licenses ADD CONSTRAINT license_dates CHECK (ends_at > starts_at);
ALTER TABLE assets ADD CONSTRAINT policy_belongs_to_asset
  FOREIGN KEY (id, current_policy_version_id)
  REFERENCES policy_versions(asset_id, id);
CREATE UNIQUE INDEX one_open_payment_attempt_per_order
  ON payment_attempts(order_id)
  WHERE status IN ('creating', 'pending', 'processing');
CREATE INDEX active_license_dates ON licenses(ends_at) WHERE status = 'issued';
CREATE INDEX outbox_pending ON outbox_events(available_at)
  WHERE status IN ('pending', 'retry');
```

Generar enums/CHECKs para todos los estados de la sección 9. Integridad entre asset, oferta, política, request y quote mediante FKs compuestas donde corresponda y validación transaccional; no admitir referencias cruzadas entre creadores. Añadir índices a FKs consultadas y a búsquedas publicadas.

`policy_versions.payload` y los snapshots requieren esquemas estrictos versionados; JSONB no reemplaza el modelado de estados, propietarios, importes o FKs. Escrituras de snapshots, consentimientos, contratos, asientos y auditoría restringidas mediante permisos/triggers. Un rol de aplicación no puede UPDATE/DELETE en tablas append-only. No llamarlo inmutable frente a un superusuario: exportar evidencias a almacenamiento con retención protegida y acceso separado antes de live.

Cada journal se inserta atómicamente; un constraint trigger diferido comprueba que débitos = créditos por moneda y al menos dos líneas. Prohibir cuentas con moneda distinta al journal y asientos posteriores al cierre. Las correcciones son reversos, nunca ediciones. Probar estas reglas con SQL directo, además de servicios.

## 7. Rights Passport v0.1

El passport es una representación derivada y versionada del activo, la revisión y la política. No es prueba concluyente de titularidad ni una credencial W3C en el MVP. La versión pública omite evidencia personal.

```json
{
  "schema_version": "rightsnet.passport/0.1",
  "passport_id": "rp_demo_001",
  "asset_id": "00000000-0000-4000-8000-000000000001",
  "asset_version": 1,
  "policy_version": 2,
  "identity_status": "verified",
  "relationship_status": "reviewed",
  "grant": {
    "asset_kind": "digital_likeness",
    "allowed_operations": ["synthetic_image", "synthetic_video"],
    "purpose": "commercial_advertising",
    "allowed_categories": ["beauty", "lifestyle"],
    "allowed_territories": ["ES", "DE"],
    "allowed_channels": ["instagram", "tiktok"],
    "allowed_duration_days": [30, 90],
    "exclusivity": "none",
    "sublicensing": false,
    "training": false,
    "voice_clone": false
  },
  "denied_categories": ["politics", "adult", "gambling", "tobacco", "alcohol"],
  "approval": {"mode": "manual"},
  "offers": [
    {"duration_days": 30, "price_minor": 50000, "currency": "EUR"},
    {"duration_days": 90, "price_minor": 120000, "currency": "EUR"}
  ]
}
```

Permisos expresados positivamente, prohibiciones con listas explícitas. Evitar `politics:false` sin semántica. Un campo desconocido o requerido ausente produce error; una operación no concedida se deniega. La política de plataforma es también versionada y se referencia en cada evaluación.

Publicar exige KYC vigente, adultez acreditada por el proceso, revisión del vínculo aprobada para la versión del activo, ficheros limpios, consentimiento correspondiente y cuenta de cobro habilitada. Un resultado favorable del onboarding financiero no demuestra el vínculo con el likeness. [Stripe: verificación de cuentas conectadas](https://docs.stripe.com/connect/identity-verification).

## 8. License Engine determinista

Firma del dominio:

```ts
evaluateLicense(input: {
  buyer: VerifiedBuyerSnapshot;
  asset: AssetSnapshot;
  policy: RightsPolicyV01;
  platformPolicy: PlatformPolicy;
  offer: OfferSnapshot;
  usage: UsageRequest;
  approval?: ApprovalSnapshot;
  now: string;
}): {
  decision: 'ALLOW' | 'DENY' | 'REQUIRES_APPROVAL';
  reasonCodes: string[];
  evaluatedPolicyHash: string;
  evaluatedUsageHash: string;
};
```

La función es pura: sin red, base de datos, reloj implícito ni LLM. Antes se valida el schema; solicitudes malformadas devuelven 422 y no se evalúan como permitidas.

Orden de evaluación:

1. Comprador activo/revisado, creador activo, verificación vigente, activo publicado y sin suspensión.
2. Asset, oferta y política coincidentes; versión todavía admisible para nuevas compras.
3. Solo operaciones/purpose admitidos por el MVP; prohibiciones de plataforma prevalecen.
4. Categoría permitida y no prohibida; conjuntos solicitados de territorios/canales contenidos íntegramente en la política.
5. Duración 30/90 y oferta exacta; sin exclusividad, training, voice clone ni sublicensing.
6. Fechas válidas: inicio futuro, fin calculado por servidor, campaña identificada, anunciante igual a organización compradora.
7. Si requiere aprobación y no existe una aprobación vigente del mismo hash de uso/política: `REQUIRES_APPROVAL`.
8. `ALLOW` únicamente si pasan todas las reglas. Una aprobación humana no sobreescribe una prohibición; hace falta publicar otra política y consentirla.

Códigos estables: `BUYER_NOT_VERIFIED`, `ASSET_UNAVAILABLE`, `VERIFICATION_EXPIRED`, `POLICY_STALE`, `CATEGORY_DENIED`, `TERRITORY_NOT_ALLOWED`, `CHANNEL_NOT_ALLOWED`, `OPERATION_NOT_ALLOWED`, `DURATION_NOT_ALLOWED`, `APPROVAL_REQUIRED`, `START_TOO_SOON`.

Search filtra candidatos; solo el motor confirma elegibilidad. No afirmar que el motor verifica cómo se usará realmente el contenido. Los límites territoriales y de canal son contractuales; el MVP no vigila publicaciones.

Pricing: importe exacto del paquete, sin multiplicadores por país o canal. `fee_minor = floor(base_minor * fee_bps / 10000)`; `creator_minor = base_minor - fee_minor`. Impuestos y costes de PSP se registran separadamente. Una quote congela cada partida y caduca en 60 minutos. En sandbox, ejemplo: 50.000 céntimos, comisión 7.500, creador 42.500; no implica 7.500 de margen neto.

## 9. Estados, concurrencia y emisión

- Asset: `draft → pending_review → published`; salidas `rejected`, `suspended`, `archived`. Revisión nueva para una nueva versión de material.
- Request: `submitted → denied | awaiting_approval | eligible`; aprobación puede producir `eligible` o `denied`; quote vencida exige reevaluación.
- Order: `awaiting_acceptance → awaiting_payment → payment_processing → paid → issuing → fulfilled`. Alternativas `expired`, `cancelled`, `paid_requires_review`, `refund_pending`, `refunded`. Transiciones se ejecutan mediante servicios con locks, nunca PATCH libre de estado.
- Payment attempt: `creating → pending → processing → succeeded | failed | expired`; eventos tardíos se reconcilian contra proveedor, sin degradar un pago confirmado por un evento antiguo.
- License almacenada: `issued | suspended | revoked`; estado público calculado: `NOT_YET_VALID | VALID | EXPIRED | SUSPENDED | REVOKED | INVALID`.

Cada checkout requiere inicio al menos 24 horas después de crearlo, plazo que se comunica al comprador. Días equivalen a bloques de 24 horas UTC; intervalo `[starts_at, ends_at)`. No emitir retroactivamente si el cobro llega después del inicio; pasar a revisión/reembolso.

La creación de orden bloquea la quote, comprueba caducidad y elegibilidad, genera contrato exacto y reserva una orden única. Tras aceptación, la creación de checkout revalida política vigente y gates, y congela el permiso para esa orden hasta la caducidad de checkout. Una edición ordinaria posterior de la política afecta a nuevas órdenes; no altera este snapshot. Una suspensión urgente bloquea activación aunque la orden esté congelada.

Pago y emisión no son una transacción distribuida con Stripe. Persistir intención local, llamar proveedor con clave idempotente, recuperar tras timeout y conciliar. Nunca mantener un lock SQL durante una llamada remota.

Al confirmar pago: lock de orden; validar importe, moneda, cuenta, modo test/live y vínculo con PaymentIntent; registrar journal y outbox una sola vez. Emitir una sola licencia por orden. Firma/certificado se reintentan; mientras falten, mostrar “pago recibido, licencia en preparación”. Si hay bloqueo urgente, `paid_requires_review`; no conceder permisos silenciosamente. Alerta operativa si no se resuelve en 15 minutos.

La revocación requiere actor autorizado, motivo y fundamento contractual registrado. Cambiar una política, retirar un listing, reembolsar o abrir una disputa no equivale automáticamente a revocar un contrato. El procedimiento jurídico acordado determina la acción y notificaciones. El motor consulta suspensiones expresas.

## 10. Contratos API

OpenAPI 3.1 es la fuente de verdad; generar cliente TS. Prefijo `/v1`; JSON con campos desconocidos rechazados, timestamps RFC3339, UUIDs, paginación por cursor y límite máximo 100. Operaciones de escritura críticas requieren `Idempotency-Key`. Misma clave y mismo cuerpo devuelve el resultado original; mismo ámbito/clave con cuerpo distinto devuelve 409. Reservar clave atómicamente; manejar requests concurrentes como `REQUEST_IN_PROGRESS` con retry indicado.

| Método y ruta | Entrada | Resultado / autorización |
|---|---|---|
| GET /me | — | Usuario y memberships actuales |
| POST /organizations | legal_name, country, billing | 201; usuario autenticado, owner inicial |
| POST /creators | display_name, bio, languages | 201; propio perfil |
| POST /creators/me/identity-session | return_url permitida | 201; sesión proveedor, propietario |
| POST /assets | kind | 201 draft; creador |
| POST /assets/:id/upload-intents | mime_type, size_bytes | 201 URL privada temporal; propietario |
| POST /assets/:id/versions | file_ids, metadata | 201; ficheros subidos y saneados |
| POST /assets/:id/policies | policy | 201 borrador versionado |
| POST /policies/:id/consent | document_hash, acceptance | 201 recibo, creador autenticado |
| POST /assets/:id/submit | version_id, policy_id | 202 pending_review |
| POST /admin/assets/:id/reviews | decision, reason, evidence_ref | 201; admin + MFA |
| POST /assets/:id/publish | policy_id, offer_ids | 200; propietario, gates satisfechos |
| GET /search | filtros estructurados | 200 listings públicos |
| GET /assets/:id | — | 200 proyección pública o privada autorizada |
| GET /assets/:id/passport | — | 200 passport público saneado |
| POST /license-requests | organization_id, asset_id, usage | 201 evaluación persistida; buyer/owner |
| POST /license-requests/:id/decision | approve/reject, usage_hash | 200; dueño del activo |
| POST /quotes | request_id, offer_id | 201 si eligible; comprador |
| POST /orders | quote_id | 201 orden y contrato; comprador |
| POST /orders/:id/acceptance | document_hash, acceptance | 201 recibo; comprador autorizado |
| POST /orders/:id/checkout | — | 201 url y expires_at; comprador |
| GET /orders/:id | — | 200 estado; comprador o vendedor con proyección limitada |
| GET /licenses | cursor | 200 propias o de organización autorizada |
| GET /licenses/:id | — | 200 detalle privado autorizado |
| GET /licenses/:id/certificate | — | 200 descarga temporal; partes |
| GET /public/licenses/:token/verify | — | 200 estado mínimo; 404 token desconocido |
| POST /incidents | asset_id/license_id, category, details | 201; rate limit, antispam |
| POST /admin/licenses/:id/status-actions | action, reason, evidence_ref | 200; admin + MFA |
| POST /admin/orders/:id/refunds | reason | 202 reembolso total, admin + MFA |
| POST /webhooks/stripe | raw body | 2xx tras persistencia, firma requerida |
| POST /webhooks/identity | raw body | autenticidad según proveedor, deduplicación |

Ejemplo de solicitud de uso:

```json
{
  "campaign_name": "Summer skin",
  "operation": "synthetic_video",
  "purpose": "commercial_advertising",
  "category": "beauty",
  "territories": ["ES", "DE"],
  "channels": ["instagram"],
  "duration_days": 30,
  "starts_at": "2026-10-01T00:00:00Z",
  "exclusivity": "none",
  "sublicensing": false,
  "training": false,
  "voice_clone": false
}
```

Errores: `{ "error": { "code": "TERRITORY_NOT_ALLOWED", "message": "…", "details": {}, "request_id": "…" } }`. 401 sin identidad; 403 acción no permitida; 404 para recursos privados ajenos; 409 conflicto/versiones/estado; 422 validación o inelegibilidad; 429 límite; 503 proveedor temporalmente indisponible. No devolver trazas, secretos o datos de otros usuarios.

No exponer `POST /licenses` para emitir arbitrariamente: la emisión es interna y derivada de una orden pagada. No aceptar del navegador precio, comisión, estado KYC, seller Stripe account o estado de licencia como datos autoritativos.

## 11. Stripe, ledger y recuperación

Decisión provisional: Stripe Checkout y Connect con destination charges, una cuenta conectada por creador. Hosted onboarding para datos financieros. La configuración definitiva depende de la entidad/países y disponibilidad; no decidir `on_behalf_of` por intuición. Con destination charges la plataforma soporta determinados costes de procesamiento, disputas y devoluciones; incluirlos en el modelo económico. [Stripe: destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=elements).

MVP admite medios de pago que se confirmen en el checkout seleccionado; la implementación igualmente soporta estado processing y confirmaciones tardías. No activar por return URL ni por un evento de sesión que no acredite el pago. Construir `amount`, `application_fee_amount` y destino en servidor. Usar metadatos con IDs internos, nunca evidencia personal.

Webhook: verificar firma sobre raw body, persistir con ID único, devolver 2xx y procesar mediante worker. Si no se puede persistir, devolver error para retry. Asumir duplicados y desorden. Procesar pagos, refunds, disputas, cambios de cuenta y payouts según la suscripción configurada; recuperar estado autoritativo ante ambigüedad. [Stripe: webhooks](https://docs.stripe.com/webhooks), [Connect webhooks](https://docs.stripe.com/connect/webhooks).

Claves idempotentes de proveedor derivadas de operación e ID estable, nunca nuevas por cada retry. La deduplicación local vive más allá de la ventana del proveedor. [Stripe: idempotencia](https://docs.stripe.com/api/idempotent_requests?lang=node).

Ledger propuesto para un cobro de €500 sin impuestos en sandbox:

| Evento | Débito | Crédito |
|---|---|---|
| Cobro confirmado | PSP clearing 500 | Creator payable 425 + Platform fee revenue 75 |
| Transfer al conectado confirmado | Creator payable 425 | PSP clearing 425 |
| Coste PSP conocido | PSP fees expense X | PSP clearing X |

Los journals reflejan hechos financieros confirmados. No registrar transferencia ni payout por suponer que el cobro los garantiza. El payout bancario del conectado se refleja en `payout_records`; no reduce dos veces la deuda ya liquidada por transfer. El panel separa bruto, fee, transfer y payout. La clasificación contable final requiere validación para el modelo de entidad adoptado.

Reembolsos completos en piloto: solicitud idempotente, refund del charge y tratamiento explícito del transfer/application fee según acuerdo; confirmar cada efecto y asentar reversos. La devolución por sí sola no confirma recuperación de fondos del conectado. Guardar fallos de reversión como exposición pendiente y alertar. Reembolsos parciales quedan fuera de UI; si llegan desde proveedor, conciliarlos y escalar para revisión.

Conciliación diaria y on-demand: comparar órdenes, PaymentIntents, charges, transferencias, application fees, balance transactions, refunds, disputas y payouts; reportar diferencias sin “arreglar” historia borrando registros. Outbox con retry exponencial, jitter, máximo configurable, estado dead-letter y replay administrativo auditado. Sin promesa de exactly-once del transporte: unicidad de efectos mediante constraints y transacciones.

## 12. Contrato, aceptación y licencia verificable

Generar documento desde plantilla versionada y términos estructurados. Congelar texto/render/hash antes de aceptar. La aceptación referencia exactamente ese hash, identidad autenticada, organización y evidencia temporal. El creador previamente acepta la política y mandato comercial aplicable; una aprobación manual se vincula también a uso y versión. Un cambio de documento exige nueva aceptación.

En desarrollo, encabezado visible `DEMO — NO VÁLIDO PARA LICENCIAR`. Una plantilla demo bloquea live. La aceptación electrónica es evidencia técnica; no atribuirle la categoría de firma cualificada ni suficiencia jurídica universal.

Certificado: payload JSON canónico, hash SHA-256 y firma asimétrica con biblioteca mantenida y claves del servicio de firma/KMS. Incluir issuer, license_id, order reference opaca, hashes de política/contrato/uso, fechas, asset reference y key ID. Definir algoritmo y canonicalización en ADR antes de M5; aportar test vectors. Evitar criptografía propia.

Mantener claves públicas históricas para verificar firmas tras rotación, y procedimiento para claves comprometidas. Un PDF es una representación, no la fuente de verdad. Firmar un certificado solo demuestra integridad/origen del emisor; el estado actual requiere consultar el servicio.

Verificación: token aleatorio no secuencial con al menos 128 bits de entropía. Comprobar certificado, issuer, firma y estado. `VALID` solo si firma correcta, licencia issued y `starts_at <= now < ends_at`. Suspensión/revocación prevalecen sobre fechas; firma inválida produce `INVALID`. Si el backend falla, mostrar indisponible, nunca VALID ni INVALID por defecto. Respuesta con `checked_at`, `Cache-Control: no-store`, `signature_valid` y estado. No prometer validación jurídica del contenido generado.

W3C VC 2.0 está publicado como Recommendation, pero no se afirmará compatibilidad sin implementar su perfil y mecanismo de seguridad. Interoperabilidad RightsML/ODRL, VC y C2PA pertenece a un ADR futuro. [W3C VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/).

## 13. Seguridad y operación mínima

- Autorización por recurso y organización en API; pruebas de acceso cruzado. Rol SQL dedicado de mínimo privilegio; navegador sin claves privilegiadas. RLS como defensa adicional si se exponen tablas a servicios Supabase.
- Cookies seguras, protección CSRF donde se usen cookies, CORS allowlist, validación de issuer/audience/expiry del token; no construir auth propia.
- Storage privado, URLs firmadas breves, límites de carga, comprobación de MIME real y malware scan antes de publicar o procesar. No permitir importar URLs arbitrarias en MVP.
- Separar documentos KYC de previews. Proveedor conserva documentos cuando sea posible; almacenar solo referencias/resultado. No enviar KYC o contratos a LLMs.
- Secretos por entorno; sin secretos en logs, fixtures ni `NEXT_PUBLIC_*`. Encriptación administrada, rotación de claves y revocación de sesiones.
- Rate limits de login, upload, search, verificación y compra. Límites consistentes entre instancias mediante ingress/servicio compartido; no solo memoria local.
- Auditoría de verificación, publicación, consentimiento, aprobación, aceptación, cobro, emisión, suspensión y reembolso. Excluir cuerpos sensibles de logs generales.
- Backups con PITR en plan compatible; ensayo de restore antes de live. Objetivos propuestos: RPO ≤15 minutos, RTO ≤4 horas; documentar resultados reales.
- Métricas: edad del evento más antiguo, fallos de firma/webhook, órdenes paid sin licencia, duplicados evitados, descuadres, disponibilidad y latencia. Logs con request/order IDs.
- Runbooks: proveedor caído, pago sin emisión, refund sin reversión, cuenta conectada deshabilitada, incidente de suplantación, clave comprometida, restore y takedown.
- Reporte urgente puede suspender nuevas ventas y abrir revisión; no destruir evidencias ni reescribir contratos. Retención, minimización y tratamiento de solicitudes de borrado según política aprobada para el piloto.

## 14. Tests y criterios técnicos

No basta con capturas o tests del happy path. Usar Vitest para dominio, integración NestJS contra PostgreSQL real desechable y Playwright para recorridos web. Proveedores fake deterministas para CI; Stripe test mode para staging. Ningún dato o cobro real en pruebas.

Casos obligatorios:

1. Denegar todos los derechos ausentes/desconocidos, categorías prohibidas y conjuntos parcialmente permitidos.
2. Límites exactos de duración, inicio, caducidad de quote, expiración KYC y fin exclusivo de licencia usando reloj inyectado.
3. Aprobación manual de hash antiguo no autoriza uso editado; admin tampoco elude una prohibición.
4. Creador no puede publicar sin consentimiento/revisión ni alterar otro activo; usuario de org A no puede leer/comprar/descargar en B.
5. Dos checkouts concurrentes producen una orden y un intento abierto; misma idempotency key con cuerpo diferente falla.
6. Webhook repetido/paralelo y eventos desordenados producen un solo journal y una sola licencia; return URL falsificada no activa nada.
7. Timeout tras crear sesión en Stripe se recupera sin cobrar otra vez; crash tras commit antes de ack no duplica efectos.
8. Pago con importe, moneda, cuenta o entorno incorrectos se pone en revisión; no emite.
9. Política ordinaria modificada tras checkout respeta snapshot congelado; suspensión urgente bloquea activación y dispara resolución del cobro.
10. Firma fallida/reintento conserva “en preparación”; clave rotada valida certificados históricos; certificado alterado da INVALID.
11. Asientos desbalanceados o UPDATE sobre evidencia se rechazan en DB; refunds y reversos no duplican saldos.
12. Recorrido completo automático y manual, compra denegada, pago fallido, expiración y descarga privada.
13. Restauración y replay de eventos conservan unicidad; conciliación detecta un evento omitido deliberadamente.

Objetivos de carga para staging, documentando hardware/dataset: 1.000 perfiles, 10.000 órdenes, 20 usuarios concurrentes; search p95 <800 ms y evaluación local p95 <100 ms. Son objetivos de aceptación propuestos, no benchmarks existentes.

## 15. CI/CD y despliegue

Desarrollo: Docker para PostgreSQL/servicios locales, Auth/Storage de Supabase local o entorno dev dedicado. Un comando `pnpm dev`; fixtures claramente sintéticos y no basados en celebridades. Integraciones detrás de interfaces `IdentityProvider`, `PaymentsProvider`, `DocumentStore`, `CertificateSigner`, `EmailProvider`.

CI por PR: instalación frozen lockfile, lint, typecheck, tests de dominio/integración, validación OpenAPI, generación de tipos sin diff, migraciones desde cero y desde esquema anterior, build, E2E esenciales, detección de secretos y dependencias vulnerables según política documentada. Evitar snapshots que solo reflejen implementación.

Destino propuesto: web en Vercel; API y worker en contenedores en una región UE; Supabase en región UE compatible. Proveedor de contenedores seleccionado en ADR de M1 según disponibilidad, presupuesto y acceso. Esta selección no declara cumplimiento de residencia para todos los proveedores externos.

Entornos dev/staging/prod con bases, buckets, secretos y Stripe separados. Preview deployments sin acceso a producción. Despliegue staging automático tras checks; producción con release deliberada y gates completos. Migraciones con estrategia expand/contract; jobs con leases; health/readiness; rollback de aplicación compatible con esquema. No automatizar un rollback SQL destructivo.

`.env.example` documenta URLs de Auth/API/DB/Storage, claves públicas de auth, secretos privados de Stripe y webhook, cuenta/configuración Connect, identidad, firma, email y flags `APP_ENV`, `LIVE_COMMERCE_ENABLED`. Valores de ejemplo vacíos o fake, nunca credenciales reales.

## 16. Milestones y gates

| Milestone | Entrega acotada | Gate de aceptación |
|---|---|---|
| M0 — definición piloto | launch-gates, hipótesis, jurisdicción pendiente, operación de verificación y esquema comercial | Decisiones trazables; bloqueos live visibles; sandbox permitido |
| M1 — foundation | monorepo, web/API, DB/migraciones users/orgs, Auth, roles, UI shell, CI, README | Arranca limpio; CI verde; dos orgs aisladas; health endpoints; fixtures |
| M2 — creator | perfil, upload seguro, proveedor fake, revisión, política/consentimiento, oferta y publicación | Publicación imposible sin gates; versiones preservadas; UI de onboarding completa |
| M3 — licensing | discover, configuración uso, motor, aprobación, quotes, orden y plantilla DEMO | Casos permitidos/denegados/manuales probados; precio servidor; contrato previo al pago |
| M4 — payments | Connect/Checkout test, aceptación, webhooks, outbox, ledger y conciliación | Duplicados/concurrencia/crashes probados; cobros confirmados trazables |
| M5 — issuance | firma, certificado, verificación, paneles, suspensión, incidentes y refund | Loop sandbox completo; licencia única; refund y certificado alterado probados |
| M6 — piloto real | proveedores live, plantilla aprobada, fiscalidad, seguridad/restore y runbooks | Todos los launch-gates acreditados; primera compra supervisada y conciliada |

Cada milestone es una unidad de entrega, no una estimación de una semana. Si es demasiado grande, dividir verticalmente manteniendo el mismo alcance. Administración mínima se construye junto al flujo que necesita; contratos y aceptación preceden al pago. No posponerlos al final para mostrar checkout antes de tener términos.

Definition of Done de cada milestone: cambios revisables, migraciones necesarias, tests relevantes ejecutados, documentación de arranque, pantallas de error/vacío, ningún TODO crítico oculto y declaración explícita de lo simulado. Una integración sin credenciales se entrega con fake y contrato de adaptador, sin afirmar prueba real.

## 17. Instrucción lista para ejecutar en Astra

> Lee este brief y los archivos existentes del repositorio. Mantén el scope en likeness de creadores adultos para publicidad AI. Implementa solo M1; registra en launch-gates las decisiones M0 aún pendientes sin inventar sus respuestas. Si ya existe M1, verifica sus criterios y comunica el estado antes de seleccionar otro milestone. Usa versiones estables verificadas, monolito modular, API autorizada por recurso y migraciones versionadas. Entrega una base funcional con Auth, organizaciones, roles, UI shell, PostgreSQL y CI, sin implementar checkout, generación AI, voz, música, MCP ni negociación. Puedes utilizar adaptadores fake explícitos en desarrollo. No simules verificaciones ni pagos reales. Ejecuta las pruebas apropiadas y documenta cómo reproducirlas. Termina indicando qué funciona, qué has probado, qué depende de configuración externa y cuál es la siguiente entrega acotada. No despliegues comercio real con gates pendientes.

## 18. Roadmap separado

Después de validar licencias reales: operación y renovaciones; API comercial y webhooks; búsqueda asistida con confirmación de filtros; MCP con límites de autorización; evidencia de uso; interoperabilidad VC/C2PA; y solo tras validación específica nuevas clases de derechos. Cada extensión necesita su propia hipótesis, esquema, riesgos, pruebas y gate comercial.

La primera meta sigue siendo una licencia de likeness pagada, trazable y liquidada. Ningún elemento del roadmap puede retrasar la validación de ese recorrido.
