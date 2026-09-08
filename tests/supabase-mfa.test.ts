import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
import { seed } from '../packages/db/seed.js';
import { config } from '../apps/api/src/common/config.js';
import {
  setSupabaseAuthPort,
  supabaseLogin,
  supabaseMfaVerify,
  supabaseMfaEnroll,
  supabaseMfaEnrollConfirm,
  type SupabaseAuthPort,
  type AuthSession,
} from '../apps/api/src/integrations/supabase-auth.js';
import { DomainError } from '../packages/domain/src/index.js';

let previousAuth: string;
let previousMfa: boolean;

function fakeUser(overrides: Partial<SupabaseUser> & { id: string; email: string }): SupabaseUser {
  return {
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as SupabaseUser;
}

describe('Auth MFA v0.1', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!url.pathname.endsWith('_test'))
      throw new Error('Tests require a dedicated database ending _test');
    await migrate();
    await seed();
  });

  beforeEach(() => {
    previousAuth = config.auth;
    previousMfa = config.mfaEnabled;
    (config as { auth: string }).auth = 'supabase';
    (config as { mfaEnabled: boolean }).mfaEnabled = true;
  });

  afterEach(() => {
    setSupabaseAuthPort(null);
    (config as { auth: string }).auth = previousAuth;
    (config as { mfaEnabled: boolean }).mfaEnabled = previousMfa;
  });

  afterAll(() => pool.end());

  it('login returns mfa_required when AAL needs step-up', async () => {
    const id = randomUUID();
    const email = id + '@mfa.test';
    const user = fakeUser({ id, email });
    const factorId = randomUUID();

    const port: SupabaseAuthPort = {
      async signInWithPassword() {
        return {
          access_token: 'access_' + id,
          refresh_token: 'refresh_' + id,
          expires_in: 3600,
          user,
        };
      },
      async signUp() {
        throw new Error('unused');
      },
      async refreshSession() {
        throw new Error('unused');
      },
      async getUser() {
        return user;
      },
      async resetPasswordForEmail() {},
      async signOut() {},
      async getAuthenticatorAssuranceLevel() {
        return { currentLevel: 'aal1', nextLevel: 'aal2' };
      },
      async listTotpFactors() {
        return [{ id: factorId, status: 'verified', friendly_name: 'RightsNet' }];
      },
    };
    setSupabaseAuthPort(port);

    const result = await supabaseLogin(email, 'password12');
    expect(result).toMatchObject({
      status: 'mfa_required',
      factor_id: factorId,
      user: null,
    });
    expect('token' in result && (result as { token?: string }).token).toBeFalsy();
  });

  it('mfa verify provisions session', async () => {
    const id = randomUUID();
    const email = id + '@mfa-verify.test';
    const user = fakeUser({ id, email });
    const factorId = randomUUID();

    const port: SupabaseAuthPort = {
      async signInWithPassword() {
        throw new Error('unused');
      },
      async signUp() {
        throw new Error('unused');
      },
      async refreshSession() {
        throw new Error('unused');
      },
      async getUser() {
        return user;
      },
      async resetPasswordForEmail() {},
      async signOut() {},
      async mfaVerify(input): Promise<AuthSession> {
        if (input.code !== '123456') throw new DomainError('MFA_FAILED', 401);
        return {
          access_token: 'access_aal2_' + id,
          refresh_token: 'refresh_aal2_' + id,
          expires_in: 3600,
          user,
        };
      },
    };
    setSupabaseAuthPort(port);

    const result = await supabaseMfaVerify({
      access_token: 'access_' + id,
      refresh_token: 'refresh_' + id,
      factor_id: factorId,
      code: '123456',
    });
    expect(result.status).toBe('session');
    expect(result.token).toContain('aal2');
    expect(result.user.id).toBe(id);
  });

  it('enroll + confirm when MFA enabled', async () => {
    const id = randomUUID();
    const email = id + '@mfa-enroll.test';
    const user = fakeUser({ id, email });
    const factorId = randomUUID();

    const port: SupabaseAuthPort = {
      async signInWithPassword() {
        throw new Error('unused');
      },
      async signUp() {
        throw new Error('unused');
      },
      async refreshSession() {
        throw new Error('unused');
      },
      async getUser() {
        return user;
      },
      async resetPasswordForEmail() {},
      async signOut() {},
      async mfaEnroll() {
        return {
          factor_id: factorId,
          qr_code: 'data:image/svg+xml;base64,abc',
          secret: 'SECRETBASE32',
        };
      },
      async mfaChallengeVerifyEnroll(input) {
        if (input.code !== '654321') throw new DomainError('MFA_FAILED', 401);
        return {
          access_token: 'access_enrolled_' + id,
          refresh_token: 'refresh_enrolled_' + id,
          expires_in: 3600,
          user,
        };
      },
    };
    setSupabaseAuthPort(port);

    const started = await supabaseMfaEnroll('access_' + id, 'refresh_' + id);
    expect(started.factor_id).toBe(factorId);

    const confirmed = await supabaseMfaEnrollConfirm({
      access_token: 'access_' + id,
      refresh_token: 'refresh_' + id,
      factor_id: factorId,
      code: '654321',
    });
    expect(confirmed.enrolled).toBe(true);
    expect(confirmed.token).toContain('enrolled');
  });

  it('MFA disabled returns MFA_DISABLED', async () => {
    (config as { mfaEnabled: boolean }).mfaEnabled = false;
    await expect(
      supabaseMfaVerify({
        access_token: 'x'.repeat(24),
        refresh_token: 'y'.repeat(12),
        factor_id: randomUUID(),
        code: '123456',
      }),
    ).rejects.toMatchObject({ code: 'MFA_DISABLED' });
  });
});
