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

/** Sandbox-only; never transmitted over the network. */
export type EmailOutboxRecord = {
  id: string;
  to: string;
  subject: string;
  text: string;
  kind: string;
  resource_id?: string;
  notification_id: string;
  status: 'sandbox_queued';
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
  listEmailOutbox?: (limit?: number) => Promise<EmailOutboxRecord[]>;
};

let testPort: NotificationPort | null = null;

export function setNotificationPortForTests(port: NotificationPort | null) {
  testPort = port;
}

function rootDir() {
  return path.resolve(process.env.NOTIFICATIONS_DIR ?? '.local/notifications');
}

function opsEmail() {
  return process.env.NOTIFY_OPS_EMAIL?.trim() || 'ops@localhost.invalid';
}

function appendJsonl(filePath: string, row: unknown) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(filePath, JSON.stringify(row) + '\n', { mode: 0o600 });
}

function readJsonlRecent<T>(filePath: string, limit: number): T[] {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out: T[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      out.push(JSON.parse(lines[i]!) as T);
    } catch {
      /* skip */
    }
  }
  return out;
}

function listNotificationFilesRecent(limit: number): NotificationRecord[] {
  const dir = rootDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
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
      const day = record.created_at.slice(0, 10);
      appendJsonl(path.join(rootDir(), `${day}.jsonl`), record);
      return record;
    },
    listRecent: async (limit = 50) => listNotificationFilesRecent(limit),
  };
}

function emailOutboxPort(): NotificationPort {
  const base = sandboxPort();
  const outboxPath = () => path.join(rootDir(), 'email-outbox.jsonl');
  return {
    notify: async (input) => {
      const record = await base.notify(input);
      const mail: EmailOutboxRecord = {
        id: randomUUID(),
        to: opsEmail(),
        subject: `[RightsNet] ${record.title}`,
        text: record.body,
        kind: record.kind,
        resource_id: record.resource_id,
        notification_id: record.id,
        status: 'sandbox_queued',
        created_at: record.created_at,
      };
      appendJsonl(outboxPath(), mail);
      return record;
    },
    listRecent: async (limit = 50) => base.listRecent(limit),
    listEmailOutbox: async (limit = 50) => readJsonlRecent<EmailOutboxRecord>(outboxPath(), limit),
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
  const provider =
    process.env.NOTIFY_PROVIDER === 'log' ||
    process.env.NOTIFY_PROVIDER === 'email' ||
    process.env.NOTIFY_PROVIDER === 'email_outbox' ||
    process.env.NOTIFY_PROVIDER === 'sandbox'
      ? process.env.NOTIFY_PROVIDER
      : config.notifyProvider;
  if (provider === 'email') {
    throw new Error(
      'NOTIFY_PROVIDER=email (SMTP) is not implemented (use sandbox|log|email_outbox; see docs/NOTIFICATIONS_EMAIL_OUTBOX_V0_1.md)',
    );
  }
  if (provider === 'email_outbox') return emailOutboxPort();
  if (provider === 'log') return logPort();
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
