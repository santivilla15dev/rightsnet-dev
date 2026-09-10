import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export type NotificationChannel = 'ops' | 'user';

export type NotificationRecord = {
  id: string;
  channel: NotificationChannel;
  kind: string;
  title: string;
  body: string;
  resource_id?: string;
  created_at: string;
};

export type NotificationPort = {
  notify: (input: {
    channel?: NotificationChannel;
    kind: string;
    title: string;
    body: string;
    resource_id?: string;
  }) => Promise<NotificationRecord>;
  listRecent: (limit?: number) => Promise<NotificationRecord[]>;
};

let testPort: NotificationPort | null = null;

export function setNotificationPortForTests(port: NotificationPort | null) {
  testPort = port;
}

function rootDir() {
  return path.resolve(process.env.NOTIFICATIONS_DIR ?? '.local/notifications');
}

function sandboxPort(): NotificationPort {
  return {
    notify: async (input) => {
      const record: NotificationRecord = {
        id: randomUUID(),
        channel: input.channel ?? 'ops',
        kind: input.kind,
        title: input.title,
        body: input.body,
        resource_id: input.resource_id,
        created_at: new Date().toISOString(),
      };
      const dir = rootDir();
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const day = record.created_at.slice(0, 10);
      appendFileSync(path.join(dir, `${day}.jsonl`), JSON.stringify(record) + '\n', {
        mode: 0o600,
      });
      return record;
    },
    listRecent: async (limit = 50) => {
      const dir = rootDir();
      if (!existsSync(dir)) return [];
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
        .reverse();
      const out: NotificationRecord[] = [];
      for (const f of files) {
        const lines = readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            out.push(JSON.parse(lines[i]!) as NotificationRecord);
          } catch {
            /* skip bad line */
          }
          if (out.length >= limit) return out;
        }
      }
      return out;
    },
  };
}

function logPort(): NotificationPort {
  const mem: NotificationRecord[] = [];
  return {
    notify: async (input) => {
      const record: NotificationRecord = {
        id: randomUUID(),
        channel: input.channel ?? 'ops',
        kind: input.kind,
        title: input.title,
        body: input.body,
        resource_id: input.resource_id,
        created_at: new Date().toISOString(),
      };
      mem.unshift(record);
      if (mem.length > 500) mem.length = 500;
      console.info('[notify]', record.kind, record.title, record.resource_id ?? '');
      return record;
    },
    listRecent: async (limit = 50) => mem.slice(0, limit),
  };
}

export function notificationPort(): NotificationPort {
  if (testPort) return testPort;
  if (config.notifyProvider === 'email') {
    throw new Error(
      'NOTIFY_PROVIDER=email is not implemented in v0.1 (use sandbox|log; see docs/NOTIFICATIONS_V0_1.md)',
    );
  }
  if (config.notifyProvider === 'log') return logPort();
  return sandboxPort();
}

/** Fire-and-forget ops alert; never throws to callers. */
export function notifyOps(input: {
  kind: string;
  title: string;
  body: string;
  resource_id?: string;
}) {
  void notificationPort()
    .notify({ ...input, channel: 'ops' })
    .catch((err) => console.warn('notifyOps failed', err));
}
