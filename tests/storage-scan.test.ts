import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from '../packages/db/migrate.js';
import { seed } from '../packages/db/seed.js';
import { pool } from '../packages/db/index.js';
import { assertConfiguration, config } from '../apps/api/src/common/config.js';
import {
  EICAR_SIGNATURE,
  clamavScanner,
  malwareScannerPort,
  setMalwareScannerPortForTests,
} from '../apps/api/src/modules/adapters/malware-scanner.js';
import {
  objectStorePort,
  s3Store,
  setObjectStorePortForTests,
} from '../apps/api/src/modules/adapters/object-store.js';

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) throw new Error('Tests require _test database');
  await migrate();
  await seed();
});

afterAll(async () => {
  setMalwareScannerPortForTests(null);
  setObjectStorePortForTests(null);
  await pool.end();
});

describe('Storage + malware scan v0.1', () => {
  it('sandbox scanner rejects EICAR and cleans normal bytes', async () => {
    const scanner = malwareScannerPort();
    expect(await scanner.scan(Buffer.from(EICAR_SIGNATURE))).toBe('rejected');
    expect(await scanner.scan(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBe('clean');
  });

  it('local object store round-trips bytes under .local/uploads', async () => {
    const key = 'test/' + randomUUID();
    const bytes = Buffer.from('rightsnet-store-' + randomUUID());
    const store = objectStorePort();
    await store.put(key, bytes);
    expect(await store.get(key)).toEqual(bytes);
    await store.delete?.(key);
    await rm(path.resolve('.local/uploads', key), { force: true }).catch(() => undefined);
  });
});

describe('Storage S3 + ClamAV v0.1', () => {
  it('s3Store signs and round-trips via injected fetch', async () => {
    const blobs = new Map<string, Buffer>();
    const store = s3Store({
      bucket: 'rn-test',
      region: 'eu-central-1',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret_test',
      endpoint: 'https://s3.test.local',
      forcePathStyle: true,
      fetchImpl: (async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        const key = decodeURIComponent(url.split('/rn-test/')[1] ?? '');
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
        expect(headers['x-amz-date']).toBeTruthy();
        if (method === 'PUT') {
          blobs.set(key, Buffer.from(init?.body as Buffer));
          return new Response(null, { status: 200 });
        }
        if (method === 'GET') {
          const b = blobs.get(key);
          if (!b) return new Response(null, { status: 404 });
          return new Response(new Uint8Array(b), { status: 200 });
        }
        if (method === 'DELETE') {
          blobs.delete(key);
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 405 });
      }) as typeof fetch,
    });
    const key = 'evidence/' + randomUUID();
    const bytes = Buffer.from('s3-roundtrip-' + randomUUID());
    await store.put(key, bytes);
    expect(await store.get(key)).toEqual(bytes);
    await store.delete?.(key);
  });

  it('clamavScanner maps FOUND→rejected and OK→clean via mock clamd', async () => {
    const server = createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (c) => {
        chunks.push(c);
        const buf = Buffer.concat(chunks);
        if (buf.includes(Buffer.from([0, 0, 0, 0]))) {
          const body = buf.toString('latin1');
          const found = body.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
          socket.end(found ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const scanner = clamavScanner({ host: '127.0.0.1', port: addr.port });
    try {
      expect(await scanner.scan(Buffer.from('hello'))).toBe('clean');
      expect(await scanner.scan(Buffer.from(EICAR_SIGNATURE))).toBe('rejected');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it('defaults CI siguen local+sandbox; assertConfiguration no exige S3', () => {
    expect(config.storageProvider).toBe('local');
    expect(config.malwareScanProvider).toBe('sandbox');
    assertConfiguration();
  });

  it('s3Store.presignGet emite URL SigV4 query-string con caducidad', async () => {
    const fixed = new Date('2026-09-10T12:00:00.000Z');
    const store = s3Store({
      bucket: 'rn-test',
      region: 'eu-central-1',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret_test',
      endpoint: 'https://s3.test.local',
      forcePathStyle: true,
      now: () => fixed,
    });
    const url = await store.presignGet!('evidence/abc', 120);
    expect(url).toContain('https://s3.test.local/rn-test/evidence/abc?');
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Expires=120');
    expect(url).toContain('X-Amz-Date=20260910T120000Z');
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}/);
    expect(objectStorePort().presignGet).toBeUndefined();
  });

  it('s3Store.put usa multipart cuando supera el umbral', async () => {
    const calls: { method: string; url: string }[] = [];
    const uploadId = 'uid-1';
    const payload = Buffer.from(Array.from({ length: 122 }, (_, i) => i)).subarray(1, 121);
    const store = s3Store({
      bucket: 'rn-test',
      region: 'eu-central-1',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret_test',
      endpoint: 'https://s3.test.local',
      forcePathStyle: true,
      multipartThreshold: 100,
      multipartPartSize: 60,
      fetchImpl: (async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        calls.push({ method, url });
        if (method === 'POST' && url.includes('uploads')) {
          return new Response(
            `<InitiateMultipartUploadResult><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
            { status: 200 },
          );
        }
        if (method === 'PUT' && url.includes('partNumber=')) {
          const n = new URL(url).searchParams.get('partNumber');
          const sent = Buffer.from(init?.body as Uint8Array);
          const offset = (Number(n) - 1) * 60;
          expect(sent).toEqual(payload.subarray(offset, offset + 60));
          expect((init?.headers as Record<string, string>)['x-amz-content-sha256']).toBe(
            createHash('sha256').update(sent).digest('hex'),
          );
          return new Response(null, { status: 200, headers: { etag: `"etag-${n}"` } });
        }
        if (method === 'POST' && url.includes('uploadId=')) {
          const body = Buffer.from(init?.body as Buffer).toString('utf8');
          expect(body).toContain('<CompleteMultipartUpload>');
          expect(body).toContain('<PartNumber>1</PartNumber>');
          expect(body).toContain('<PartNumber>2</PartNumber>');
          return new Response('<CompleteMultipartUploadResult/>', { status: 200 });
        }
        return new Response('unexpected', { status: 500 });
      }) as typeof fetch,
    });
    await store.put('big/' + randomUUID(), payload);
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('uploads'))).toBe(true);
    expect(calls.filter((c) => c.method === 'PUT' && c.url.includes('partNumber=')).length).toBe(2);
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('uploadId='))).toBe(true);
  });
});
