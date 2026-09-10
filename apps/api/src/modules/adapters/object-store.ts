import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { config } from '../../common/config.js';

export type ObjectStorePort = {
  put: (key: string, bytes: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer>;
  delete?: (key: string) => Promise<void>;
};

export type S3StoreConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  fetchImpl?: typeof fetch;
};

let testPort: ObjectStorePort | null = null;

export function setObjectStorePortForTests(port: ObjectStorePort | null) {
  testPort = port;
}

function localRoot() {
  return path.resolve(process.env.LOCAL_UPLOAD_ROOT ?? '.local/uploads');
}

function assertSafeKey(key: string) {
  const root = path.resolve(localRoot());
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep) && full !== root) throw new Error('INVALID_STORAGE_KEY');
  return full;
}

function localStore(): ObjectStorePort {
  return {
    put: async (key, bytes) => {
      const full = assertSafeKey(key);
      await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
      await writeFile(full, bytes, { mode: 0o600, flag: 'wx' });
    },
    get: async (key) => readFile(assertSafeKey(key)),
    delete: async (key) => {
      await unlink(assertSafeKey(key)).catch(() => undefined);
    },
  };
}

function amzDate(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso.slice(0, 16), day: iso.slice(0, 8) };
}

function hmac(key: Buffer | string, data: string) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string) {
  return createHash('sha256').update(data).digest('hex');
}

function signingKey(secret: string, day: string, region: string) {
  const kDate = hmac(`AWS4${secret}`, day);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

/** S3-compatible put/get/delete (AWS / MinIO / R2) with SigV4 — no AWS SDK. */
export function s3Store(cfg: S3StoreConfig): ObjectStorePort {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const endpointHost = cfg.endpoint
    ? new URL(cfg.endpoint).host
    : `s3.${cfg.region}.amazonaws.com`;
  const pathStyle = Boolean(cfg.forcePathStyle || cfg.endpoint);

  function objectUrl(key: string) {
    const enc = key
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    if (pathStyle) {
      const base = (cfg.endpoint ?? `https://${endpointHost}`).replace(/\/$/, '');
      return `${base}/${cfg.bucket}/${enc}`;
    }
    return `https://${cfg.bucket}.${endpointHost}/${enc}`;
  }

  async function signed(method: string, key: string, body?: Buffer) {
    const url = objectUrl(key);
    const u = new URL(url);
    const { amz, day } = amzDate();
    const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
    const canonicalHeaders =
      `host:${u.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amz}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      u.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${day}/${cfg.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
    const sig = createHmac('sha256', signingKey(cfg.secretAccessKey, day, cfg.region))
      .update(stringToSign, 'utf8')
      .digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${sig}`;
    return {
      url,
      headers: {
        host: u.host,
        Authorization: authorization,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amz,
        ...(body ? { 'Content-Length': String(body.length) } : {}),
      } as Record<string, string>,
      body,
    };
  }

  return {
    put: async (key, bytes) => {
      const req = await signed('PUT', key, bytes);
      const res = await fetchImpl(req.url, { method: 'PUT', headers: req.headers, body: req.body });
      if (!res.ok) throw new Error(`S3_PUT_FAILED ${res.status}`);
    },
    get: async (key) => {
      const req = await signed('GET', key);
      const res = await fetchImpl(req.url, { method: 'GET', headers: req.headers });
      if (res.status === 404) throw new Error('S3_NOT_FOUND');
      if (!res.ok) throw new Error(`S3_GET_FAILED ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    delete: async (key) => {
      const req = await signed('DELETE', key);
      const res = await fetchImpl(req.url, { method: 'DELETE', headers: req.headers });
      if (!res.ok && res.status !== 404) throw new Error(`S3_DELETE_FAILED ${res.status}`);
    },
  };
}

export function s3StoreFromEnv(): ObjectStorePort {
  const bucket = process.env.S3_BUCKET ?? '';
  const region = process.env.S3_REGION ?? 'eu-central-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY ?? '';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET and AWS/S3 access keys');
  }
  return s3Store({
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || Boolean(endpoint),
  });
}

/** Active object store: `local` (default) or opt-in `s3`. */
export function objectStorePort(): ObjectStorePort {
  if (testPort) return testPort;
  if (config.storageProvider === 's3') return s3StoreFromEnv();
  return localStore();
}
