import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const prev = process.env.NOTIFICATIONS_DIR;

  beforeEach(() => {
    setNotificationPortForTests(null);
    dir = mkdtempSync(path.join(tmpdir(), 'rn-notify-'));
    process.env.NOTIFICATIONS_DIR = dir;
  });

  afterEach(() => {
    setNotificationPortForTests(null);
    if (prev === undefined) delete process.env.NOTIFICATIONS_DIR;
    else process.env.NOTIFICATIONS_DIR = prev;
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
});
