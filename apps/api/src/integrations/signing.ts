import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { canonical, hash } from '../../../../packages/domain/src/index.js';

export type SigningPurpose = 'license' | 'rn-auth';

export type SigningKeyMaterial = {
  privateKey: KeyObject;
  publicKey: KeyObject;
  kid: string;
  pem: string;
};

export type SigningKeyStore = {
  getActive: (purpose: SigningPurpose) => SigningKeyMaterial;
  rotate: (purpose: SigningPurpose) => SigningKeyMaterial;
  getPublicPem: (kid: string) => string | null;
  listPublicKids: () => string[];
};

const PURPOSE_FILE: Record<SigningPurpose, string> = {
  license: 'license-private.pem',
  'rn-auth': 'rn-auth-private.pem',
};

function keysDir() {
  return path.resolve(process.env.SIGNING_KEYS_DIR ?? '.local/keys');
}

function provider(): string {
  return (process.env.SIGNING_PROVIDER ?? 'local').toLowerCase();
}

function assertLocalProvider() {
  if (provider() !== 'local') {
    throw new Error(
      `SIGNING_PROVIDER=${provider()} is not implemented in v0.1 (use local; remote KMS is a later milestone)`,
    );
  }
}

function kidFromPem(pem: string) {
  return hash(pem).slice(0, 16);
}

function writePublic(dir: string, kid: string, pem: string) {
  const publicPath = path.join(dir, kid + '.pub.pem');
  if (!existsSync(publicPath)) writeFileSync(publicPath, pem, { mode: 0o644 });
}

function materialFromPrivatePem(pemBytes: Buffer): SigningKeyMaterial {
  const privateKey = createPrivateKey(pemBytes);
  const publicKey = createPublicKey(privateKey);
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const kid = kidFromPem(pem);
  return { privateKey, publicKey, kid, pem };
}

function localStore(): SigningKeyStore {
  const dir = keysDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  function privatePath(purpose: SigningPurpose) {
    return path.join(dir, PURPOSE_FILE[purpose]);
  }

  function loadOrCreate(purpose: SigningPurpose): SigningKeyMaterial {
    const keyPath = privatePath(purpose);
    if (!existsSync(keyPath)) {
      const pair = generateKeyPairSync('ed25519');
      try {
        writeFileSync(keyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), {
          mode: 0o600,
          flag: 'wx',
        });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    const material = materialFromPrivatePem(readFileSync(keyPath));
    writePublic(dir, material.kid, material.pem);
    return material;
  }

  return {
    getActive: (purpose) => loadOrCreate(purpose),
    rotate: (purpose) => {
      const keyPath = privatePath(purpose);
      if (existsSync(keyPath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        renameSync(keyPath, `${keyPath}.rotated-${stamp}`);
      }
      const pair = generateKeyPairSync('ed25519');
      writeFileSync(keyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), {
        mode: 0o600,
        flag: 'wx',
      });
      const material = materialFromPrivatePem(readFileSync(keyPath));
      writePublic(dir, material.kid, material.pem);
      return material;
    },
    getPublicPem: (kid) => {
      if (!/^[a-f0-9]{16}$/.test(kid)) return null;
      const p = path.join(dir, kid + '.pub.pem');
      if (!existsSync(p)) return null;
      return readFileSync(p, 'utf8');
    },
    listPublicKids: () =>
      readdirSync(dir)
        .filter((f) => f.endsWith('.pub.pem'))
        .map((f) => f.replace(/\.pub\.pem$/, ''))
        .filter((k) => /^[a-f0-9]{16}$/.test(k))
        .sort(),
  };
}

let testStore: SigningKeyStore | null = null;

export function setSigningKeyStoreForTests(store: SigningKeyStore | null) {
  testStore = store;
}

export function signingKeyStore(): SigningKeyStore {
  if (testStore) return testStore;
  assertLocalProvider();
  return localStore();
}

export function signingKeys() {
  return signingKeyStore().getActive('license');
}

/** Dedicated keypair for RN-AUTH (rotation independent of RN-LIC). */
export function rnAuthSigningKeys() {
  return signingKeyStore().getActive('rn-auth');
}

export function signPayload(payload: unknown) {
  const keys = signingKeys();
  return {
    signature: sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString('base64url'),
    key_id: keys.kid,
  };
}

export function verifyPayload(payload: unknown, signature: string, kid: string) {
  try {
    const pem = signingKeyStore().getPublicPem(kid);
    if (!pem) return false;
    return verify(
      null,
      Buffer.from(canonical(payload)),
      createPublicKey(pem),
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

export function signRnAuthPayload(payload: unknown) {
  const keys = rnAuthSigningKeys();
  return {
    signature: sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString('base64url'),
    key_id: keys.kid,
  };
}

export function verifyRnAuthPayload(payload: unknown, signature: string, kid: string) {
  return verifyPayload(payload, signature, kid);
}

export function rotateSigningKey(purpose: SigningPurpose) {
  return signingKeyStore().rotate(purpose);
}
