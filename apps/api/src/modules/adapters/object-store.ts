import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { config } from '../../common/config.js';

/** S3 minimum part size (except last). Default threshold to enter multipart. */
export const S3_MULTIPART_MIN_PART = 5 * 1024 * 1024;

export type MultipartPart = { partNumber: number; etag: string };

export type ObjectStorePort = {
  put: (key: string, bytes: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer>;
  delete?: (key: string) => Promise<void>;
  /** Optional short-lived GET URL (S3). Local store omits this. */
  presignGet?: (key: string, expiresSeconds?: number) => Promise<string>;
  createMultipartUpload?: (key: string) => Promise<{ uploadId: string }>;
  uploadPart?: (
    key: string,
    uploadId: string,
    partNumber: number,
    bytes: Buffer,
  ) => Promise<{ etag: string }>;
  completeMultipartUpload?: (
    key: string,
    uploadId: string,
    parts: MultipartPart[],
  ) => Promise<void>;
  abortMultipartUpload?: (key: string, uploadId: string) => Promise<void>;
};

export type S3StoreConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Bytes above which `put` uses multipart (default 5 MiB). */
  multipartThreshold?: number;
  /** Part size for auto multipart `put` (default 5 MiB). */
  multipartPartSize?: number;
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

function encodeRfc3986(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQueryFrom(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(params[k]!)}`)
    .join('&');
}

function xmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1] ?? null;
}

/** S3-compatible put/get/delete + presignGet + multipart (AWS / MinIO / R2). */
export function s3Store(cfg: S3StoreConfig): ObjectStorePort {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const now = cfg.now ?? (() => new Date());
  const endpointHost = cfg.endpoint
    ? new URL(cfg.endpoint).host
    : `s3.${cfg.region}.amazonaws.com`;
  const pathStyle = Boolean(cfg.forcePathStyle || cfg.endpoint);
  const multipartThreshold = cfg.multipartThreshold ?? S3_MULTIPART_MIN_PART;
  const multipartPartSize = cfg.multipartPartSize ?? S3_MULTIPART_MIN_PART;

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

  async function signed(
    method: string,
    key: string,
    opts?: { body?: Buffer; query?: Record<string, string>; contentType?: string },
  ) {
    const base = objectUrl(key);
    const query = opts?.query ? canonicalQueryFrom(opts.query) : '';
    const url = query ? `${base}?${query}` : base;
    const u = new URL(url);
    const { amz, day } = amzDate(now());
    const body = opts?.body;
    const payloadHash = sha256Hex(body ?? Buffer.alloc(0));
    const headerLines = [`host:${u.host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amz}`];
    if (opts?.contentType) headerLines.push(`content-type:${opts.contentType}`);
    headerLines.sort();
    const canonicalHeaders = headerLines.map((l) => l + '\n').join('');
    const signedHeaders = headerLines.map((l) => l.split(':')[0]).join(';');
    const canonicalRequest = [
      method,
      u.pathname,
      query,
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
    const headers: Record<string, string> = {
      host: u.host,
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
    };
    if (opts?.contentType) headers['Content-Type'] = opts.contentType;
    if (body) headers['Content-Length'] = String(body.length);
    return { url, headers, body };
  }

  async function createMultipartUpload(key: string) {
    const req = await signed('POST', key, { query: { uploads: '' } });
    const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers });
    if (!res.ok) throw new Error(`S3_CREATE_MULTIPART_FAILED ${res.status}`);
    const uploadId = xmlText(await res.text(), 'UploadId');
    if (!uploadId) throw new Error('S3_CREATE_MULTIPART_NO_UPLOAD_ID');
    return { uploadId };
  }

  async function uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    bytes: Buffer,
  ) {
    const req = await signed('PUT', key, {
      body: bytes,
      query: { partNumber: String(partNumber), uploadId },
    });
    const res = await fetchImpl(req.url, { method: 'PUT', headers: req.headers, body: req.body === undefined ? undefined : new Uint8Array(req.body) });
    if (!res.ok) throw new Error(`S3_UPLOAD_PART_FAILED ${res.status}`);
    const etag = res.headers.get('etag') ?? res.headers.get('ETag');
    if (!etag) throw new Error('S3_UPLOAD_PART_NO_ETAG');
    return { etag: etag.replaceAll('"', '') };
  }

  async function completeMultipartUpload(key: string, uploadId: string, parts: MultipartPart[]) {
    const xml =
      '<CompleteMultipartUpload>' +
      parts
        .slice()
        .sort((a, b) => a.partNumber - b.partNumber)
        .map(
          (p) =>
            `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`,
        )
        .join('') +
      '</CompleteMultipartUpload>';
    const body = Buffer.from(xml, 'utf8');
    const req = await signed('POST', key, {
      body,
      query: { uploadId },
      contentType: 'application/xml',
    });
    const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: req.body === undefined ? undefined : new Uint8Array(req.body) });
    if (!res.ok) throw new Error(`S3_COMPLETE_MULTIPART_FAILED ${res.status}`);
  }

  async function abortMultipartUpload(key: string, uploadId: string) {
    const req = await signed('DELETE', key, { query: { uploadId } });
    const res = await fetchImpl(req.url, { method: 'DELETE', headers: req.headers });
    if (!res.ok && res.status !== 404) throw new Error(`S3_ABORT_MULTIPART_FAILED ${res.status}`);
  }

  async function putSimple(key: string, bytes: Buffer) {
    const req = await signed('PUT', key, { body: bytes });
    const res = await fetchImpl(req.url, { method: 'PUT', headers: req.headers, body: req.body === undefined ? undefined : new Uint8Array(req.body) });
    if (!res.ok) throw new Error(`S3_PUT_FAILED ${res.status}`);
  }

  async function putMultipart(key: string, bytes: Buffer) {
    const { uploadId } = await createMultipartUpload(key);
    const parts: MultipartPart[] = [];
    try {
      for (let offset = 0, n = 1; offset < bytes.length; offset += multipartPartSize, n++) {
        const chunk = bytes.subarray(offset, Math.min(offset + multipartPartSize, bytes.length));
        const { etag } = await uploadPart(key, uploadId, n, chunk);
        parts.push({ partNumber: n, etag });
      }
      await completeMultipartUpload(key, uploadId, parts);
    } catch (err) {
      await abortMultipartUpload(key, uploadId).catch(() => undefined);
      throw err;
    }
  }

  return {
    put: async (key, bytes) => {
      if (bytes.length > multipartThreshold) await putMultipart(key, bytes);
      else await putSimple(key, bytes);
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
    createMultipartUpload,
    uploadPart,
    completeMultipartUpload,
    abortMultipartUpload,
    presignGet: async (key, expiresSeconds = 300) => {
      const expires = Math.min(Math.max(1, Math.floor(expiresSeconds)), 3600);
      const url = objectUrl(key);
      const u = new URL(url);
      const { amz, day } = amzDate(now());
      const scope = `${day}/${cfg.region}/s3/aws4_request`;
      const credential = `${cfg.accessKeyId}/${scope}`;
      const params: Record<string, string> = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': credential,
        'X-Amz-Date': amz,
        'X-Amz-Expires': String(expires),
        'X-Amz-SignedHeaders': 'host',
      };
      const canonicalQuery = canonicalQueryFrom(params);
      const canonicalRequest = [
        'GET',
        u.pathname,
        canonicalQuery,
        `host:${u.host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
      ].join('\n');
      const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
      const signature = createHmac('sha256', signingKey(cfg.secretAccessKey, day, cfg.region))
        .update(stringToSign, 'utf8')
        .digest('hex');
      return `${url}?${canonicalQuery}&X-Amz-Signature=${signature}`;
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
  const threshold = Number(process.env.S3_MULTIPART_THRESHOLD);
  const partSize = Number(process.env.S3_MULTIPART_PART_SIZE);
  return s3Store({
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || Boolean(endpoint),
    multipartThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : undefined,
    multipartPartSize: Number.isFinite(partSize) && partSize > 0 ? partSize : undefined,
  });
}

/** Active object store: `local` (default) or opt-in `s3`. */
export function objectStorePort(): ObjectStorePort {
  if (testPort) return testPort;
  if (config.storageProvider === 's3') return s3StoreFromEnv();
  return localStore();
}
