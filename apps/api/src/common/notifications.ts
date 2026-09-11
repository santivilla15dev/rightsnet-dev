import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
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

/** Local audit of mail attempts; sandbox_queued never hits the network. */
export type EmailOutboxRecord = {
  id: string;
  to: string;
  subject: string;
  text: string;
  kind: string;
  resource_id?: string;
  notification_id: string;
  status: 'sandbox_queued' | 'sent' | 'failed';
  error?: string;
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

export type SmtpSendPort = {
  sendMail: (msg: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<{ messageId?: string }>;
};

let testPort: NotificationPort | null = null;
let testSmtp: SmtpSendPort | null = null;

export function setNotificationPortForTests(port: NotificationPort | null) {
  testPort = port;
}

export function setSmtpSendPortForTests(port: SmtpSendPort | null) {
  testSmtp = port;
}

function rootDir() {
  return path.resolve(process.env.NOTIFICATIONS_DIR ?? '.local/notifications');
}

function opsEmail() {
  return process.env.NOTIFY_OPS_EMAIL?.trim() || 'ops@localhost.invalid';
}

function smtpFrom() {
  return process.env.SMTP_FROM?.trim() || opsEmail();
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

function nodemailerSmtpPort(): SmtpSendPort {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 0);
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error('SMTP_HOST and SMTP_PORT are required for NOTIFY_PROVIDER=email');
  }
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? '';
  const secure =
    process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
  return {
    sendMail: async (msg) => {
      const info = await transport.sendMail(msg);
      return { messageId: typeof info.messageId === 'string' ? info.messageId : undefined };
    },
  };
}

function resolveSmtpSendPort(): SmtpSendPort {
  if (testSmtp) return testSmtp;
  return nodemailerSmtpPort();
}

function emailSmtpPort(): NotificationPort {
  const base = sandboxPort();
  const outboxPath = () => path.join(rootDir(), 'email-outbox.jsonl');
  return {
    notify: async (input) => {
      const record = await base.notify(input);
      const to = opsEmail();
      const subject = `[RightsNet] ${record.title}`;
      const text = record.body;
      const mailId = randomUUID();
      try {
        await resolveSmtpSendPort().sendMail({
          from: smtpFrom(),
          to,
          subject,
          text,
        });
        const mail: EmailOutboxRecord = {
          id: mailId,
          to,
          subject,
          text,
          kind: record.kind,
          resource_id: record.resource_id,
          notification_id: record.id,
          status: 'sent',
          created_at: new Date().toISOString(),
        };
        appendJsonl(outboxPath(), mail);
      } catch (err) {
        const mail: EmailOutboxRecord = {
          id: mailId,
          to,
          subject,
          text,
          kind: record.kind,
          resource_id: record.resource_id,
          notification_id: record.id,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          created_at: new Date().toISOString(),
        };
        appendJsonl(outboxPath(), mail);
        throw err;
      }
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
  if (provider === 'email') return emailSmtpPort();
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
