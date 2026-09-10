import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from '../packages/db/migrate.js';
import { seed } from '../packages/db/seed.js';
import { pool } from '../packages/db/index.js';
import {
  EICAR_SIGNATURE,
  malwareScannerPort,
  setMalwareScannerPortForTests,
} from '../apps/api/src/modules/adapters/malware-scanner.js';
import {
  objectStorePort,
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
