import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import pg from 'pg';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed } from '../packages/db/seed.js';
import { actor } from '../apps/api/src/common/auth.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setSupabaseAuthPort,
  supabaseLogin,
  supabaseRefresh,
  supabaseSignup,
  supabaseEstablishSession,
  supabaseForgotPassword,
  bootstrapOrganization,
  setupOrganization,
  type SignUpResult,
  type SupabaseAuthPort,
} from '../apps/api/src/integrations/supabase-auth.js';
import { DomainError } from '../packages/domain/src/index.js';

let previousAuth: string;
let lastReset: { email: string; redirectTo: string } | null = null;

function fakeUser(overrides: Partial<SupabaseUser> & { id: string; email: string }): SupabaseUser {
  return {
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as SupabaseUser;
}

function mockPort(store: {
  users: Map<string, { password: string; user: SupabaseUser }>;
  refresh: Map<string, string>;
  requireEmailConfirm?: boolean;
}): SupabaseAuthPort {
  return {
    async signInWithPassword({ email, password }) {
      const row = store.users.get(email.toLowerCase());
      if (!row || row.password !== password) throw new DomainError('AUTH_FAILED', 401);
      const access = 'access_' + row.user.id;
      const refresh = 'refresh_' + row.user.id + '_' + randomUUID().slice(0, 8);
      store.refresh.set(refresh, row.user.id);
      return {
        access_token: access,
        refresh_token: refresh,
        expires_in: 3600,
        user: row.user,
      };
    },
    async signUp({ email, password, display_name }) {
      const key = email.toLowerCase();
      if (store.users.has(key)) throw new DomainError('AUTH_FAILED', 400, 'User already registered');
      const id = randomUUID();
      const user = fakeUser({
        id,
        email,
        user_metadata: {
          ...(display_name ? { display_name } : {}),
        },
      });
      store.users.set(key, { password, user });
      if (store.requireEmailConfirm) return { kind: 'check_email', user };
      const access = 'access_' + id;
      const refresh = 'refresh_' + id + '_' + randomUUID().slice(0, 8);
      store.refresh.set(refresh, id);
      return {
        kind: 'session',
        session: {
          access_token: access,
          refresh_token: refresh,
          expires_in: 3600,
          user,
        },
      } satisfies SignUpResult;
    },
    async refreshSession(refreshToken) {
      const userId = store.refresh.get(refreshToken);
      if (!userId) throw new DomainError('AUTH_FAILED', 401);
      const entry = [...store.users.values()].find((u) => u.user.id === userId);
      if (!entry) throw new DomainError('AUTH_FAILED', 401);
      const access = 'access_' + userId + '_r';
      const refresh = 'refresh_' + userId + '_' + randomUUID().slice(0, 8);
      store.refresh.delete(refreshToken);
      store.refresh.set(refresh, userId);
      return {
        access_token: access,
        refresh_token: refresh,
        expires_in: 3600,
        user: entry.user,
      };
    },
    async getUser(accessToken) {
      const id = accessToken.replace(/^access_/, '').replace(/_r$/, '');
      const entry = [...store.users.values()].find((u) => u.user.id === id);
      if (!entry) throw new DomainError('UNAUTHENTICATED', 401);
      return entry.user;
    },
    async resetPasswordForEmail(email, redirectTo) {
      lastReset = { email, redirectTo };
    },
    async signOut() {},
  };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test'))
    throw new Error('Tests require a dedicated database ending _test');
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Unsafe test DB name');
  url.pathname = '/postgres';
  const management = new pg.Pool({ connectionString: url.toString() });
  if (!(await management.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await management.query('CREATE DATABASE ' + name);
  await management.end();
  await migrate();
  await seed();
});

afterAll(() => pool.end());

beforeEach(() => {
  previousAuth = config.auth;
  config.auth = 'supabase';
  lastReset = null;
});

afterEach(() => {
  setSupabaseAuthPort(null);
  config.auth = previousAuth;
});

describe.sequential('Auth Supabase v0.2', () => {
  it('logs in, provisions RightsNet user, and resolves actor', async () => {
    const id = randomUUID();
    const email = `buyer-${id.slice(0, 8)}@auth.test`;
    const store = {
      users: new Map([
        [
          email,
          {
            password: 'password123',
            user: fakeUser({
              id,
              email,
              app_metadata: { role: 'buyer' },
              user_metadata: { display_name: 'Auth Buyer' },
            }),
          },
        ],
      ]),
      refresh: new Map<string, string>(),
    };
    setSupabaseAuthPort(mockPort(store));

    const login = await supabaseLogin(email, 'password123');
    expect(login.user.id).toBe(id);
    expect(login.user.role).toBe('buyer');
    expect(login.user.display_name).toBe('Auth Buyer');
    expect(login.token).toMatch(/^access_/);
    expect(login.refresh_token).toMatch(/^refresh_/);

    const me = await actor({
      headers: { authorization: 'Bearer ' + login.token },
    } as Request);
    expect(me.id).toBe(id);
    expect(me.email).toBe(email);

    const orgs = await pool.query(
      'SELECT o.legal_name FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1',
      [id],
    );
    expect(orgs.rowCount).toBe(0);
  });

  it('signs up account without creator lock or org', async () => {
    const store = { users: new Map(), refresh: new Map<string, string>() };
    setSupabaseAuthPort(mockPort(store));
    const email = `acct-${randomUUID().slice(0, 8)}@auth.test`;
    const result = await supabaseSignup({
      email,
      password: 'password123',
      display_name: 'Cuenta Nueva',
    });
    expect(result.status).toBe('session');
    if (result.status !== 'session') return;
    expect(result.user.role).toBe('buyer');
    expect(result.user.display_name).toBe('Cuenta Nueva');
    const orgs = await pool.query(
      'SELECT 1 FROM organization_members WHERE user_id=$1',
      [result.user.id],
    );
    expect(orgs.rowCount).toBe(0);
    const creators = await pool.query('SELECT 1 FROM creators WHERE user_id=$1', [result.user.id]);
    expect(creators.rowCount).toBe(0);
  });

  it('bootstraps organization for brand space', async () => {
    const store = { users: new Map(), refresh: new Map<string, string>() };
    setSupabaseAuthPort(mockPort(store));
    const email = `marca-${randomUUID().slice(0, 8)}@auth.test`;
    const result = await supabaseSignup({
      email,
      password: 'password123',
      display_name: 'Alex Marca',
    });
    expect(result.status).toBe('session');
    if (result.status !== 'session') return;
    const boot = await bootstrapOrganization(result.user.id, result.user.display_name, {
      org_name: 'Estudio Demo SA',
      country: 'ES',
    });
    expect(boot.organizations[0]).toMatchObject({
      legal_name: 'Estudio Demo SA',
      country: 'ES',
      role: 'owner',
    });
  });

  it('setup organization maps agency/owner/employee and AT', async () => {
    const store = { users: new Map(), refresh: new Map<string, string>() };
    setSupabaseAuthPort(mockPort(store));

    const agency = await supabaseSignup({
      email: `agency-${randomUUID().slice(0, 8)}@auth.test`,
      password: 'password123',
      display_name: 'Agency User',
    });
    expect(agency.status).toBe('session');
    if (agency.status !== 'session') return;
    const agencyOrg = await setupOrganization(agency.user.id, agency.user.display_name, {
      legal_name: 'Nova Agency GmbH',
      website: 'https://nova.example',
      country: 'AT',
      member_role: 'agency',
    });
    expect(agencyOrg.organizations[0]).toMatchObject({
      legal_name: 'Nova Agency GmbH',
      country: 'AT',
      website: 'https://nova.example',
      org_kind: 'agency',
      role: 'owner',
    });

    const owner = await supabaseSignup({
      email: `owner-${randomUUID().slice(0, 8)}@auth.test`,
      password: 'password123',
      display_name: 'Owner User',
    });
    expect(owner.status).toBe('session');
    if (owner.status !== 'session') return;
    const ownerOrg = await setupOrganization(owner.user.id, owner.user.display_name, {
      legal_name: 'Brand Owner KG',
      country: 'DE',
      member_role: 'owner',
    });
    expect(ownerOrg.organizations[0]).toMatchObject({
      org_kind: 'brand',
      role: 'owner',
      country: 'DE',
    });

    const employee = await supabaseSignup({
      email: `emp-${randomUUID().slice(0, 8)}@auth.test`,
      password: 'password123',
      display_name: 'Employee User',
    });
    expect(employee.status).toBe('session');
    if (employee.status !== 'session') return;
    const empOrg = await setupOrganization(employee.user.id, employee.user.display_name, {
      legal_name: 'Buyer Corp',
      country: 'AT',
      member_role: 'employee',
    });
    expect(empOrg.organizations[0]).toMatchObject({
      org_kind: 'brand',
      role: 'buyer',
    });

    await expect(
      setupOrganization(employee.user.id, employee.user.display_name, {
        legal_name: 'Second Org',
        country: 'AT',
        member_role: 'owner',
      }),
    ).rejects.toMatchObject({ code: 'ORG_ALREADY_EXISTS' });
  });

  it('returns check_email when Supabase withholds session', async () => {
    const store = {
      users: new Map(),
      refresh: new Map<string, string>(),
      requireEmailConfirm: true,
    };
    setSupabaseAuthPort(mockPort(store));
    const result = await supabaseSignup({
      email: `confirm-${randomUUID().slice(0, 8)}@auth.test`,
      password: 'password123',
    });
    expect(result).toMatchObject({ status: 'check_email', user: null });
  });

  it('establishes session from OAuth tokens without role lock', async () => {
    const id = randomUUID();
    const email = `oauth-${id.slice(0, 8)}@auth.test`;
    const user = fakeUser({ id, email, user_metadata: { full_name: 'OAuth User' } });
    const store = {
      users: new Map([[email, { password: 'n/a', user }]]),
      refresh: new Map<string, string>(),
    };
    setSupabaseAuthPort(mockPort(store));
    const result = await supabaseEstablishSession({
      access_token: 'access_' + id,
      refresh_token: 'refresh_oauth',
      expires_in: 1800,
    });
    expect(result.user.role).toBe('buyer');
    expect(result.user.display_name).toBe('OAuth User');
    expect(result.token).toBe('access_' + id);
  });

  it('sends forgot-password via port', async () => {
    setSupabaseAuthPort(mockPort({ users: new Map(), refresh: new Map() }));
    const out = await supabaseForgotPassword('reset@auth.test');
    expect(out.ok).toBe(true);
    expect(lastReset?.email).toBe('reset@auth.test');
    expect(lastReset?.redirectTo).toMatch(/\/reset-password$/);
  });

  it('refreshes session and keeps the same provisioned user', async () => {
    const id = randomUUID();
    const email = `refresh-${id.slice(0, 8)}@auth.test`;
    const store = {
      users: new Map([
        [
          email,
          {
            password: 'password123',
            user: fakeUser({ id, email, app_metadata: { role: 'creator' } }),
          },
        ],
      ]),
      refresh: new Map<string, string>(),
    };
    setSupabaseAuthPort(mockPort(store));
    const login = await supabaseLogin(email, 'password123');
    const renewed = await supabaseRefresh(login.refresh_token);
    expect(renewed.user.id).toBe(id);
    expect(renewed.user.role).toBe('buyer');
    expect(renewed.token).not.toBe(login.token);
    expect(renewed.refresh_token).not.toBe(login.refresh_token);
  });

  it('rejects bad password and disabled provider', async () => {
    const id = randomUUID();
    const email = `bad-${id.slice(0, 8)}@auth.test`;
    setSupabaseAuthPort(
      mockPort({
        users: new Map([
          [email, { password: 'password123', user: fakeUser({ id, email }) }],
        ]),
        refresh: new Map(),
      }),
    );
    await expect(supabaseLogin(email, 'wrong-pass')).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      status: 401,
    });

    config.auth = 'sandbox';
    await expect(supabaseLogin(email, 'password123')).rejects.toMatchObject({
      code: 'SUPABASE_AUTH_DISABLED',
      status: 404,
    });
  });

  it('denies actor when JWT is valid but RightsNet row was never provisioned', async () => {
    const id = randomUUID();
    const email = `orphan-${id.slice(0, 8)}@auth.test`;
    const user = fakeUser({ id, email });
    setSupabaseAuthPort({
      async signInWithPassword() {
        throw new Error('unused');
      },
      async signUp() {
        throw new Error('unused');
      },
      async refreshSession() {
        throw new Error('unused');
      },
      async getUser(token) {
        if (token !== 'orphan-token') throw new DomainError('UNAUTHENTICATED', 401);
        return user;
      },
      async resetPasswordForEmail() {
        throw new Error('unused');
      },
      async signOut() {},
    });
    await expect(
      actor({ headers: { authorization: 'Bearer orphan-token' } } as Request),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_PROVISIONED', status: 403 });
  });

  it('blocks email collision with a different RightsNet user id', async () => {
    const existing = (await pool.query('SELECT email FROM users LIMIT 1')).rows[0].email as string;
    const id = randomUUID();
    setSupabaseAuthPort(
      mockPort({
        users: new Map([
          [
            existing.toLowerCase(),
            {
              password: 'password123',
              user: fakeUser({ id, email: existing, app_metadata: { role: 'buyer' } }),
            },
          ],
        ]),
        refresh: new Map(),
      }),
    );
    await expect(supabaseLogin(existing, 'password123')).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_LINKED',
      status: 409,
    });
  });
});
