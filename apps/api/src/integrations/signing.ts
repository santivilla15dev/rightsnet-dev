import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { canonical, hash } from '../../../../packages/domain/src/index.js';

const dir = path.resolve('.local/keys');

function loadOrCreateKey(fileName: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dir, fileName);
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
  const privateKey = createPrivateKey(readFileSync(keyPath));
  const publicKey = createPublicKey(privateKey);
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const kid = hash(pem).slice(0, 16);
  const publicPath = path.join(dir, kid + '.pub.pem');
  if (!existsSync(publicPath)) writeFileSync(publicPath, pem, { mode: 0o644 });
  return { privateKey, publicKey, kid, pem };
}

export function signingKeys() {
  return loadOrCreateKey('license-private.pem');
}

/** Dedicated keypair for RN-AUTH (rotation independent of RN-LIC). */
export function rnAuthSigningKeys() {
  return loadOrCreateKey('rn-auth-private.pem');
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
    if (!/^[a-f0-9]{16}$/.test(kid)) return false;
    const pem = readFileSync(path.join(dir, kid + '.pub.pem'));
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
