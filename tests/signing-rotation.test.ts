import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  rotateSigningKey,
  setSigningKeyStoreForTests,
  signPayload,
  signRnAuthPayload,
  verifyPayload,
  signingKeyStore,
} from '../apps/api/src/integrations/signing.js';

describe('Signing key rotation v0.1', () => {
  let dir: string;
  const prevDir = process.env.SIGNING_KEYS_DIR;
  const prevProvider = process.env.SIGNING_PROVIDER;

  beforeEach(() => {
    setSigningKeyStoreForTests(null);
    dir = mkdtempSync(path.join(tmpdir(), 'rn-keys-'));
    process.env.SIGNING_KEYS_DIR = dir;
    process.env.SIGNING_PROVIDER = 'local';
  });

  afterEach(() => {
    setSigningKeyStoreForTests(null);
    if (prevDir === undefined) delete process.env.SIGNING_KEYS_DIR;
    else process.env.SIGNING_KEYS_DIR = prevDir;
    if (prevProvider === undefined) delete process.env.SIGNING_PROVIDER;
    else process.env.SIGNING_PROVIDER = prevProvider;
    rmSync(dir, { recursive: true, force: true });
  });

  it('rota license: firma nueva con kid nuevo; firma vieja sigue verificando', () => {
    const payload = { sandbox: true, n: 1 };
    const before = signPayload(payload);
    const store = signingKeyStore();
    expect(store.getActive('license').kid).toBe(before.key_id);

    const rotated = rotateSigningKey('license');
    expect(rotated.kid).not.toBe(before.key_id);

    const after = signPayload(payload);
    expect(after.key_id).toBe(rotated.kid);
    expect(verifyPayload(payload, before.signature, before.key_id)).toBe(true);
    expect(verifyPayload(payload, after.signature, after.key_id)).toBe(true);
    expect(verifyPayload(payload, before.signature, after.key_id)).toBe(false);
    expect(store.listPublicKids()).toEqual(
      [before.key_id, after.key_id].sort(),
    );
  });

  it('rota rn-auth independiente de license', () => {
    const lic = signPayload({ a: 1 });
    const auth = signRnAuthPayload({ b: 2 });
    rotateSigningKey('rn-auth');
    const auth2 = signRnAuthPayload({ b: 2 });
    expect(auth2.key_id).not.toBe(auth.key_id);
    expect(signPayload({ a: 1 }).key_id).toBe(lic.key_id);
    expect(verifyPayload({ b: 2 }, auth.signature, auth.key_id)).toBe(true);
  });

  it('SIGNING_PROVIDER distinto de local falla cerrado', () => {
    process.env.SIGNING_PROVIDER = 'aws_kms';
    expect(() => signingKeyStore().getActive('license')).toThrow(/not implemented/);
  });
});
