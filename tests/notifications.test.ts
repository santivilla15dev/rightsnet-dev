import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  notificationPort,
  notifyOps,
  setNotificationPortForTests,
} from '../apps/api/src/common/notifications.js';
import { config } from '../apps/api/src/common/config.js';

describe('Notifications v0.1', () => {
  let dir: string;
  const prevDir = process.env.NOTIFICATIONS_DIR;
  const prevProvider = process.env.NOTIFY_PROVIDER;
  const prevOpsEmail = process.env.NOTIFY_OPS_EMAIL;

  beforeEach(() => {
    setNotificationPortForTests(null);
    dir = mkdtempSync(path.join(tmpdir(), 'rn-notify-'));
    process.env.NOTIFICATIONS_DIR = dir;
    delete process.env.NOTIFY_PROVIDER;
    delete process.env.NOTIFY_OPS_EMAIL;
  });

  afterEach(() => {
    setNotificationPortForTests(null);
    if (prevDir === undefined) delete process.env.NOTIFICATIONS_DIR;
    else process.env.NOTIFICATIONS_DIR = prevDir;
    if (prevProvider === undefined) delete process.env.NOTIFY_PROVIDER;
    else process.env.NOTIFY_PROVIDER = prevProvider;
    if (prevOpsEmail === undefined) delete process.env.NOTIFY_OPS_EMAIL;
    else process.env.NOTIFY_OPS_EMAIL = prevOpsEmail;
    rmSync(dir, { recursive: true, force: true });
  });

  it('sandbox persiste y listRecent devuelve lo último primero', async () => {
    const port = notificationPort();
    await port.notify({
      kind: 'license.issued',
      title: 'Licencia emitida',
      body: 'uno',
      resource_id: 'a',
    });
    await port.notify({
      kind: 'payment.confirmed',
      title: 'Pago',
      body: 'dos',
      resource_id: 'b',
    });
    const recent = await port.listRecent(10);
    expect(recent.length).toBe(2);
    expect(recent[0]?.kind).toBe('payment.confirmed');
    expect(recent[1]?.kind).toBe('license.issued');
  });

  it('notifyOps no lanza aunque el puerto falle', async () => {
    setNotificationPortForTests({
      notify: async () => {
        throw new Error('boom');
      },
      listRecent: async () => [],
    });
    expect(() =>
      notifyOps({ kind: 'x', title: 't', body: 'b' }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });

  it('default CI es sandbox', () => {
    expect(config.notifyProvider).toBe('sandbox');
  });

  it('email_outbox encola correo local sin SMTP', async () => {
    process.env.NOTIFY_PROVIDER = 'email_outbox';
    process.env.NOTIFY_OPS_EMAIL = 'ops@example.test';
    const port = notificationPort();
    const rec = await port.notify({
      kind: 'outbox.dead',
      title: 'Job dead',
      body: 'falló el lease',
      resource_id: 'job-1',
    });
    expect(port.listEmailOutbox).toBeTypeOf('function');
    const mails = await port.listEmailOutbox!(10);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.to).toBe('ops@example.test');
    expect(mails[0]?.subject).toContain('Job dead');
    expect(mails[0]?.status).toBe('sandbox_queued');
    expect(mails[0]?.notification_id).toBe(rec.id);
    const file = path.join(dir, 'email-outbox.jsonl');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('sandbox_queued');
  });
});
