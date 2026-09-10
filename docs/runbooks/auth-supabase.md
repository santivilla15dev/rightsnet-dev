# Auth Supabase — runbook (email + Google/Apple)

Para **uso de producto**: `AUTH_PROVIDER=supabase` + keys.  
`DEMO_UI_ENABLED=false` (default): sin `/demo` ni banner en la web.  
Agents/E2E: `AUTH_PROVIDER=sandbox` + `DEMO_UI_ENABLED=true` (Playwright).

## Prerequisites

1. Proyecto Supabase.
2. **Authentication → Providers**
   - Email (password) ON.
   - MFA (TOTP): enable in Supabase Auth when using `MFA_ENABLED=true` (see `docs/AUTH_MFA_V0_1.md`).
   - Google ON (Client ID/Secret de Google Cloud).
   - Apple ON (requiere Apple Developer; Services ID + key).
3. **URL configuration** (Authentication → URL Configuration):
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`, `http://localhost:3000/reset-password`
4. Desarrollo: desactiva **Confirm email** si quieres sesión inmediata tras signup email.

## Configure RightsNet

```bash
AUTH_PROVIDER=supabase
MFA_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # same anon key; required for browser OAuth
WEB_URL=http://localhost:3000
```

Reinicia `pnpm dev`.

Comprueba perfil producto:

```bash
pnpm product:ready
```

## Primer usuario (email, local)

1. En Supabase Dashboard → **Authentication → Providers → Email**: ON.
2. En desarrollo: desactiva **Confirm email** (Auth → Providers → Email) para entrar al instante.
3. Abre [http://localhost:3000/signup](http://localhost:3000/signup), crea cuenta con email + contraseña.
4. Tras signup → `/welcome`: elige **marca** (`/company/setup`) o **creador** (`/onboarding`).
5. Si Google/Apple fallan, basta el email; OAuth necesita Client ID/Secret y redirects de la sección Prerequisites.

Comprueba que la API usa Supabase: `curl -s http://127.0.0.1:4000/v1/config` → `"auth":"supabase"`.

## Flujos

| Ruta | Uso |
|------|-----|
| `/signup` | Solo cuenta (sin rol). Intent opcional para preseleccionar `/welcome`. |
| `/welcome` | ¿Qué hacer primero? Licenciar creadores → `/company/setup`, o likeness → `/onboarding`. |
| `/company/setup` | Create company: nombre, web, país AT/DE/ES, rol Owner/Empleado/Agencia. |
| `/company/ready` | Éxito → Encontrar creadores (`/discover`). |
| `/login` | Google/Apple + email |
| `/auth/callback` | OAuth → cookies |
| `/forgot-password` / `/reset-password` | Reset |

Capacidades: `has_creator` (fila `creators`) + `organizations`. No se bloquea la cuenta en un único `users.role` permanente (`buyer` es legacy de columna).

## Tests

```bash
pnpm test -- tests/supabase-auth.test.ts
```

## Out of scope (STOP)

- Magic link como login primario
- GitHub / Facebook / Microsoft
- Live commerce

MFA TOTP: `docs/AUTH_MFA_V0_1.md` (`MFA_ENABLED`).
