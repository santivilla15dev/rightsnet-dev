import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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
          return new Response(b, { status: 200 });
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
});
