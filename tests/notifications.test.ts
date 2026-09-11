import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  notificationPort,
  notifyOps,
  setNotificationPortForTests,
  setSmtpSendPortForTests,
} from '../apps/api/src/common/notifications.js';
import { assertConfiguration, config } from '../apps/api/src/common/config.js';

describe('Notifications v0.1', () => {
  let dir: string;
  const prevDir = process.env.NOTIFICATIONS_DIR;
  const prevProvider = process.env.NOTIFY_PROVIDER;
  const prevOpsEmail = process.env.NOTIFY_OPS_EMAIL;
  const prevSmtpHost = process.env.SMTP_HOST;
  const prevSmtpPort = process.env.SMTP_PORT;
  const prevSmtpFrom = process.env.SMTP_FROM;

  beforeEach(() => {
    setNotificationPortForTests(null);
    setSmtpSendPortForTests(null);
    dir = mkdtempSync(path.join(tmpdir(), 'rn-notify-'));
    process.env.NOTIFICATIONS_DIR = dir;
    delete process.env.NOTIFY_PROVIDER;
    delete process.env.NOTIFY_OPS_EMAIL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;
  });

  afterEach(() => {
    setNotificationPortForTests(null);
    setSmtpSendPortForTests(null);
    if (prevDir === undefined) delete process.env.NOTIFICATIONS_DIR;
    else process.env.NOTIFICATIONS_DIR = prevDir;
    if (prevProvider === undefined) delete process.env.NOTIFY_PROVIDER;
    else process.env.NOTIFY_PROVIDER = prevProvider;
    if (prevOpsEmail === undefined) delete process.env.NOTIFY_OPS_EMAIL;
    else process.env.NOTIFY_OPS_EMAIL = prevOpsEmail;
    if (prevSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = prevSmtpHost;
    if (prevSmtpPort === undefined) delete process.env.SMTP_PORT;
    else process.env.SMTP_PORT = prevSmtpPort;
    if (prevSmtpFrom === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = prevSmtpFrom;
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
    expect(() => notifyOps({ kind: 'x', title: 't', body: 'b' })).not.toThrow();
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

  it('email SMTP envía vía puerto inyectado y audita sent', async () => {
    process.env.NOTIFY_PROVIDER = 'email';
    process.env.NOTIFY_OPS_EMAIL = 'ops@example.test';
    process.env.SMTP_FROM = 'RightsNet <noreply@example.test>';
    const sent: Array<{ from: string; to: string; subject: string; text: string }> = [];
    setSmtpSendPortForTests({
      sendMail: async (msg) => {
        sent.push(msg);
        return { messageId: 'mid-1' };
      },
    });
    const port = notificationPort();
    const rec = await port.notify({
      kind: 'ops.alert',
      title: 'Alerta SMTP',
      body: 'cuerpo',
      resource_id: 'r1',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ops@example.test');
    expect(sent[0]?.from).toContain('noreply@example.test');
    expect(sent[0]?.subject).toContain('Alerta SMTP');
    const mails = await port.listEmailOutbox!(10);
    expect(mails[0]?.status).toBe('sent');
    expect(mails[0]?.notification_id).toBe(rec.id);
  });

  it('email SMTP audita failed si el envío falla', async () => {
    process.env.NOTIFY_PROVIDER = 'email';
    process.env.NOTIFY_OPS_EMAIL = 'ops@example.test';
    setSmtpSendPortForTests({
      sendMail: async () => {
        throw new Error('smtp down');
      },
    });
    const port = notificationPort();
    await expect(port.notify({ kind: 'ops.alert', title: 'Fallo', body: 'x' })).rejects.toThrow(
      /smtp down/,
    );
    const mails = await port.listEmailOutbox!(10);
    expect(mails[0]?.status).toBe('failed');
    expect(mails[0]?.error).toMatch(/smtp down/);
  });

  it('assertConfiguration exige SMTP_HOST/PORT cuando notifyProvider=email', () => {
    const prev = config.notifyProvider;
    config.notifyProvider = 'email';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    expect(() => assertConfiguration()).toThrow(/SMTP_HOST/);
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    expect(() => assertConfiguration()).not.toThrow();
    config.notifyProvider = prev;
  });
});
