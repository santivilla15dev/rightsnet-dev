import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { pool } from '../../../../packages/db/index.js';
import { DomainError } from '../../../../packages/domain/src/index.js';
import { config } from '../common/config.js';

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUser;
};

export type MfaFactorSummary = {
  id: string;
  friendly_name?: string;
  status: string;
};

export type SignUpResult =
  | { kind: 'session'; session: AuthSession }
  | { kind: 'check_email'; user: SupabaseUser };

export type SupabaseAuthPort = {
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<AuthSession>;
  signUp(input: {
    email: string;
    password: string;
    display_name?: string;
  }): Promise<SignUpResult>;
  refreshSession(refreshToken: string): Promise<AuthSession>;
  getUser(accessToken: string): Promise<SupabaseUser>;
  resetPasswordForEmail(email: string, redirectTo: string): Promise<void>;
  signOut(accessToken: string): Promise<void>;
  /** Optional MFA — mocks may omit; live port always implements. */
  getAuthenticatorAssuranceLevel?(accessToken: string): Promise<{
    currentLevel: string | null;
    nextLevel: string | null;
  }>;
  listTotpFactors?(accessToken: string, refreshToken: string): Promise<MfaFactorSummary[]>;
  mfaChallenge?(
    accessToken: string,
    refreshToken: string,
    factorId: string,
  ): Promise<{ challenge_id: string }>;
  mfaVerify?(input: {
    accessToken: string;
    refreshToken: string;
    factorId: string;
    challengeId: string;
    code: string;
  }): Promise<AuthSession>;
  mfaEnroll?(
    accessToken: string,
    refreshToken: string,
  ): Promise<{ factor_id: string; qr_code: string; secret: string }>;
  mfaChallengeVerifyEnroll?(input: {
    accessToken: string;
    refreshToken: string;
    factorId: string;
    code: string;
  }): Promise<AuthSession>;
};

let injected: SupabaseAuthPort | null = null;

export function setSupabaseAuthPort(port: SupabaseAuthPort | null) {
  injected = port;
}

function liveClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new DomainError(
      'SUPABASE_NOT_CONFIGURED',
      503,
      'Configura SUPABASE_URL y SUPABASE_ANON_KEY.',
    );
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function defaultPort(): SupabaseAuthPort {
  return {
    async signInWithPassword({ email, password }) {
      const client = liveClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user)
        throw new DomainError('AUTH_FAILED', 401, error?.message ?? 'Credenciales inválidas.');
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in ?? 3600,
        user: data.user,
      };
    },
    async signUp({ email, password, display_name }) {
      const client = liveClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            ...(display_name ? { display_name } : {}),
          },
        },
      });
      if (error || !data.user)
        throw new DomainError('AUTH_FAILED', 400, error?.message ?? 'No se pudo crear la cuenta.');
      if (data.session)
        return {
          kind: 'session',
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in ?? 3600,
            user: data.user,
          },
        };
      return { kind: 'check_email', user: data.user };
    },
    async refreshSession(refreshToken) {
      const client = liveClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session || !data.user)
        throw new DomainError('AUTH_FAILED', 401, error?.message ?? 'Sesión no renovable.');
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in ?? 3600,
        user: data.user,
      };
    },
    async getUser(accessToken) {
      const client = liveClient();
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) throw new DomainError('UNAUTHENTICATED', 401);
      return data.user;
    },
    async resetPasswordForEmail(email, redirectTo) {
      const client = liveClient();
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error)
        throw new DomainError('AUTH_FAILED', 400, error.message ?? 'No se pudo enviar el correo.');
    },
    async signOut(_accessToken: string) {
      // v0.1: JWT is client-held; anon key cannot revoke server-side. Cookie clear is enough.
    },
    async getAuthenticatorAssuranceLevel(accessToken: string) {
      const client = liveClient();
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
      if (error)
        throw new DomainError('AUTH_FAILED', 401, error.message ?? 'No se pudo leer AAL.');
      return {
        currentLevel: data.currentLevel ?? null,
        nextLevel: data.nextLevel ?? null,
      };
    },
    async listTotpFactors(accessToken: string, refreshToken: string) {
      const client = await clientWithSession(accessToken, refreshToken);
      const { data, error } = await client.auth.mfa.listFactors();
      if (error)
        throw new DomainError('AUTH_FAILED', 401, error.message ?? 'No se pudieron listar factores.');
      return (data.totp ?? []).map((f) => ({
        id: f.id,
        friendly_name: f.friendly_name ?? undefined,
        status: f.status,
      }));
    },
    async mfaChallenge(accessToken: string, refreshToken: string, factorId: string) {
      const client = await clientWithSession(accessToken, refreshToken);
      const { data, error } = await client.auth.mfa.challenge({ factorId });
      if (error || !data?.id)
        throw new DomainError('MFA_FAILED', 401, error?.message ?? 'No se pudo crear el desafío MFA.');
      return { challenge_id: data.id };
    },
    async mfaVerify(input) {
      const client = await clientWithSession(input.accessToken, input.refreshToken);
      const { data, error } = await client.auth.mfa.challengeAndVerify({
        factorId: input.factorId,
        code: input.code,
      });
      if (error || !data?.access_token || !data.user)
        throw new DomainError('MFA_FAILED', 401, error?.message ?? 'Código MFA inválido.');
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in ?? 3600,
        user: data.user,
      };
    },
    async mfaEnroll(accessToken: string, refreshToken: string) {
      const client = await clientWithSession(accessToken, refreshToken);
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'RightsNet',
      });
      if (error || !data?.id || !data.totp)
        throw new DomainError('MFA_FAILED', 400, error?.message ?? 'No se pudo iniciar enroll MFA.');
      return {
        factor_id: data.id,
        qr_code: data.totp.qr_code,
        secret: data.totp.secret,
      };
    },
    async mfaChallengeVerifyEnroll(input) {
      const client = await clientWithSession(input.accessToken, input.refreshToken);
      const { data, error } = await client.auth.mfa.challengeAndVerify({
        factorId: input.factorId,
        code: input.code,
      });
      if (error || !data?.access_token || !data.user)
        throw new DomainError('MFA_FAILED', 401, error?.message ?? 'Código MFA inválido.');
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in ?? 3600,
        user: data.user,
      };
    },
  };
}

async function clientWithSession(accessToken: string, refreshToken: string) {
  const client = liveClient();
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw new DomainError('UNAUTHENTICATED', 401, error.message);
  return client;
}

export function supabaseAuth(): SupabaseAuthPort {
  return injected ?? defaultPort();
}

const roles = new Set(['buyer', 'creator', 'admin', 'viewer']);

function resolveRole(authUser: SupabaseUser, preferred?: string) {
  const meta = (authUser.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [preferred, meta.role, userMeta.role];
  for (const raw of candidates) {
    if (typeof raw === 'string' && roles.has(raw)) return raw;
  }
  return 'buyer';
}

export async function ensureBuyerOrganization(
  userId: string,
  displayName: string,
  opts?: {
    org_name?: string;
    country?: 'AT' | 'DE' | 'ES';
    website?: string;
    org_kind?: 'brand' | 'agency';
    member_role?: 'owner' | 'buyer';
  },
) {
  const existing = (
    await pool.query('SELECT 1 FROM organization_members WHERE user_id=$1 LIMIT 1', [userId])
  ).rowCount;
  if (existing) return;
  const orgId = randomUUID();
  const legal =
    (opts?.org_name?.trim() && opts.org_name.trim().slice(0, 120)) ||
    `Organización de ${displayName}`.slice(0, 120);
  const country =
    opts?.country === 'AT' || opts?.country === 'DE' || opts?.country === 'ES'
      ? opts.country
      : 'AT';
  const website = opts?.website?.trim() ? opts.website.trim().slice(0, 300) : null;
  const orgKind = opts?.org_kind === 'agency' ? 'agency' : 'brand';
  const memberRole = opts?.member_role === 'buyer' ? 'buyer' : 'owner';
  await pool.query(
    'INSERT INTO organizations(id,legal_name,country,verified,website,org_kind) VALUES($1,$2,$3,false,$4,$5)',
    [orgId, legal, country, website, orgKind],
  );
  await pool.query('INSERT INTO organization_members VALUES($1,$2,$3)', [
    orgId,
    userId,
    memberRole,
  ]);
}

export type CompanySetupInput = {
  legal_name: string;
  website?: string;
  country: 'AT' | 'DE' | 'ES';
  member_role: 'owner' | 'employee' | 'agency';
};

export async function setupOrganization(
  userId: string,
  displayName: string,
  input: CompanySetupInput,
) {
  const already = (
    await pool.query(
      'SELECT o.*,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1',
      [userId],
    )
  ).rows;
  if (already.length) {
    throw new DomainError(
      'ORG_ALREADY_EXISTS',
      409,
      'Ya tienes una organización. Continúa en el marketplace.',
    );
  }
  const orgKind = input.member_role === 'agency' ? 'agency' : 'brand';
  const memberRole = input.member_role === 'employee' ? 'buyer' : 'owner';
  await ensureBuyerOrganization(userId, displayName, {
    org_name: input.legal_name,
    country: input.country,
    website: input.website,
    org_kind: orgKind,
    member_role: memberRole,
  });
  const organizations = (
    await pool.query(
      'SELECT o.*,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1',
      [userId],
    )
  ).rows;
  return { organizations };
}

export async function provisionRightsNetUser(
  authUser: SupabaseUser,
  opts?: { role?: string },
) {
  const existing = (await pool.query('SELECT * FROM users WHERE id=$1', [authUser.id])).rows[0];
  if (existing) return existing;
  const userMeta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  // New accounts: legacy role column stays 'buyer' (not an exclusive capability).
  // Never lock signup into 'creator'; admin only if already in metadata from ops.
  const preferred = opts?.role === 'admin' ? 'admin' : undefined;
  const role = preferred ?? (resolveRole(authUser) === 'admin' ? 'admin' : 'buyer');
  const email = authUser.email ?? `${authUser.id}@users.local`;
  const display =
    (typeof userMeta.display_name === 'string' && userMeta.display_name) ||
    (typeof userMeta.full_name === 'string' && userMeta.full_name) ||
    email.split('@')[0];
  const byEmail = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  if (byEmail && byEmail.id !== authUser.id)
    throw new DomainError(
      'EMAIL_ALREADY_LINKED',
      409,
      'Este correo ya pertenece a otra cuenta RightsNet.',
    );
  try {
    return (
      await pool.query(
        'INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4) RETURNING *',
        [authUser.id, email, String(display).slice(0, 80), role],
      )
    ).rows[0];
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      const raced = (await pool.query('SELECT * FROM users WHERE id=$1', [authUser.id])).rows[0];
      if (raced) return raced;
      throw new DomainError('EMAIL_ALREADY_LINKED', 409, 'Conflicto al crear la cuenta.');
    }
    throw err;
  }
}

export async function bootstrapOrganization(
  userId: string,
  displayName: string,
  opts?: { org_name?: string; country?: 'AT' | 'DE' | 'ES' },
) {
  await ensureBuyerOrganization(userId, displayName, opts);
  const organizations = (
    await pool.query(
      'SELECT o.*,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1',
      [userId],
    )
  ).rows;
  return { organizations };
}

export async function supabaseLogin(email: string, password: string) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  const session = await supabaseAuth().signInWithPassword({ email, password });
  const user = await provisionRightsNetUser(session.user);

  if (config.mfaEnabled) {
    const port = supabaseAuth();
    if (port.getAuthenticatorAssuranceLevel && port.listTotpFactors) {
      const aal = await port.getAuthenticatorAssuranceLevel(session.access_token);
      if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        const factors = await port.listTotpFactors(session.access_token, session.refresh_token);
        const totp = factors.find((f) => f.status === 'verified') ?? factors[0];
        if (totp) {
          return {
            status: 'mfa_required' as const,
            factor_id: totp.id,
            mfa_access_token: session.access_token,
            mfa_refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            user: null,
          };
        }
      }
    }
  }

  return {
    status: 'session' as const,
    token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user,
  };
}

export async function supabaseMfaVerify(input: {
  access_token: string;
  refresh_token: string;
  factor_id: string;
  code: string;
}) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  if (!config.mfaEnabled)
    throw new DomainError('MFA_DISABLED', 404, 'MFA no está habilitado en este entorno.');
  const port = supabaseAuth();
  if (!port.mfaVerify) throw new DomainError('MFA_UNSUPPORTED', 503, 'Puerto MFA no disponible.');
  const session = await port.mfaVerify({
    accessToken: input.access_token,
    refreshToken: input.refresh_token,
    factorId: input.factor_id,
    challengeId: '',
    code: input.code.trim(),
  });
  const user = await provisionRightsNetUser(session.user);
  return {
    status: 'session' as const,
    token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user,
  };
}

export async function supabaseMfaEnroll(accessToken: string, refreshToken: string) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  if (!config.mfaEnabled)
    throw new DomainError('MFA_DISABLED', 404, 'MFA no está habilitado en este entorno.');
  const port = supabaseAuth();
  if (!port.mfaEnroll) throw new DomainError('MFA_UNSUPPORTED', 503, 'Puerto MFA no disponible.');
  await port.getUser(accessToken);
  return port.mfaEnroll(accessToken, refreshToken);
}

export async function supabaseMfaEnrollConfirm(input: {
  access_token: string;
  refresh_token: string;
  factor_id: string;
  code: string;
}) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  if (!config.mfaEnabled)
    throw new DomainError('MFA_DISABLED', 404, 'MFA no está habilitado en este entorno.');
  const port = supabaseAuth();
  if (!port.mfaChallengeVerifyEnroll)
    throw new DomainError('MFA_UNSUPPORTED', 503, 'Puerto MFA no disponible.');
  const session = await port.mfaChallengeVerifyEnroll({
    accessToken: input.access_token,
    refreshToken: input.refresh_token,
    factorId: input.factor_id,
    code: input.code.trim(),
  });
  const user = await provisionRightsNetUser(session.user);
  return {
    status: 'session' as const,
    token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user,
    enrolled: true as const,
  };
}

export async function supabaseSignup(input: {
  email: string;
  password: string;
  display_name?: string;
}) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  const result = await supabaseAuth().signUp({
    email: input.email,
    password: input.password,
    display_name: input.display_name,
  });
  if (result.kind === 'check_email') {
    return {
      status: 'check_email' as const,
      message: 'Revisa tu correo para confirmar la cuenta y luego inicia sesión.',
      user: null,
    };
  }
  const user = await provisionRightsNetUser(result.session.user);
  return {
    status: 'session' as const,
    token: result.session.access_token,
    refresh_token: result.session.refresh_token,
    expires_in: result.session.expires_in,
    user,
  };
}

export async function supabaseEstablishSession(input: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  const authUser = await supabaseAuth().getUser(input.access_token);
  const user = await provisionRightsNetUser(authUser);
  return {
    status: 'session' as const,
    token: input.access_token,
    refresh_token: input.refresh_token,
    expires_in: input.expires_in ?? 3600,
    user,
  };
}

export async function supabaseForgotPassword(email: string) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  const web = process.env.WEB_URL ?? 'http://localhost:3000';
  await supabaseAuth().resetPasswordForEmail(email, `${web.replace(/\/$/, '')}/reset-password`);
  return {
    ok: true as const,
    message: 'Si el correo existe, recibirás un enlace para restablecer la contraseña.',
  };
}

export async function supabaseRefresh(refreshToken: string) {
  if (config.auth !== 'supabase')
    throw new DomainError('SUPABASE_AUTH_DISABLED', 404, 'Auth Supabase no está activo.');
  const session = await supabaseAuth().refreshSession(refreshToken);
  const user = await provisionRightsNetUser(session.user);
  return {
    token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user,
  };
}

export async function resolveSupabaseActor(accessToken: string) {
  const authUser = await supabaseAuth().getUser(accessToken);
  const user = (await pool.query('SELECT * FROM users WHERE id=$1', [authUser.id])).rows[0];
  if (!user) throw new DomainError('ACCOUNT_NOT_PROVISIONED', 403);
  return user;
}
