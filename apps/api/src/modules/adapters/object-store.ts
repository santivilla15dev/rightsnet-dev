import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../common/config.js';

export type ObjectStorePort = {
  put: (key: string, bytes: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer>;
  delete?: (key: string) => Promise<void>;
};

let testPort: ObjectStorePort | null = null;

export function setObjectStorePortForTests(port: ObjectStorePort | null) {
  testPort = port;
}

function localRoot() {
  return path.resolve(process.env.LOCAL_UPLOAD_ROOT ?? '.local/uploads');
}

function localStore(): ObjectStorePort {
  return {
    put: async (key, bytes) => {
      const full = path.resolve(localRoot(), key);
      if (!full.startsWith(path.resolve(localRoot()) + path.sep) && full !== path.resolve(localRoot()))
        throw new Error('INVALID_STORAGE_KEY');
      await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
      await writeFile(full, bytes, { mode: 0o600, flag: 'wx' });
    },
    get: async (key) => {
      const full = path.resolve(localRoot(), key);
      if (!full.startsWith(path.resolve(localRoot()) + path.sep) && full !== path.resolve(localRoot()))
        throw new Error('INVALID_STORAGE_KEY');
      return readFile(full);
    },
    delete: async (key) => {
      const full = path.resolve(localRoot(), key);
      if (!full.startsWith(path.resolve(localRoot()) + path.sep) && full !== path.resolve(localRoot()))
        throw new Error('INVALID_STORAGE_KEY');
      await unlink(full).catch(() => undefined);
    },
  };
}

/** Active object store. v0.1: local disk only (`STORAGE_PROVIDER=local`). */
export function objectStorePort(): ObjectStorePort {
  if (testPort) return testPort;
  if (config.storageProvider !== 'local') {
    // Future: s3 — keep failing closed until implemented.
    throw new Error(`STORAGE_PROVIDER=${config.storageProvider} is not implemented in v0.1`);
  }
  return localStore();
}
