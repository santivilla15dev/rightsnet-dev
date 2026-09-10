import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  appendAuditArchive,
  verifyAuditArchiveDay,
} from '../packages/db/audit-archive.js';

describe('Audit archive v0.1', () => {
  let dir: string;
  const prevDir = process.env.AUDIT_ARCHIVE_DIR;
  const prevEn = process.env.AUDIT_ARCHIVE_ENABLED;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'rn-audit-'));
    process.env.AUDIT_ARCHIVE_DIR = dir;
    process.env.AUDIT_ARCHIVE_ENABLED = 'true';
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env.AUDIT_ARCHIVE_DIR;
    else process.env.AUDIT_ARCHIVE_DIR = prevDir;
    if (prevEn === undefined) delete process.env.AUDIT_ARCHIVE_ENABLED;
    else process.env.AUDIT_ARCHIVE_ENABLED = prevEn;
    rmSync(dir, { recursive: true, force: true });
  });

  it('cadena de hashes verifica OK y detecta manipulación', () => {
    const day = '2026-09-10';
    const t0 = `${day}T10:00:00.000Z`;
    const t1 = `${day}T10:01:00.000Z`;
    appendAuditArchive({
      id: randomUUID(),
      actor_id: null,
      action: 'test.one',
      resource_id: 'r1',
      details: { n: 1 },
      created_at: t0,
    });
    appendAuditArchive({
      id: randomUUID(),
      actor_id: randomUUID(),
      action: 'test.two',
      resource_id: 'r2',
      details: { n: 2 },
      created_at: t1,
    });
    expect(verifyAuditArchiveDay(day)).toEqual({ day, ok: true, lines: 2 });

    const file = path.join(dir, `${day}.jsonl`);
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
    const tampered = JSON.parse(lines[1]!);
    tampered.action = 'test.evil';
    writeFileSync(file, lines[0] + '\n' + JSON.stringify(tampered) + '\n');
    const bad = verifyAuditArchiveDay(day);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/HASH_MISMATCH/);
  });

  it('AUDIT_ARCHIVE_ENABLED=false no escribe', () => {
    process.env.AUDIT_ARCHIVE_ENABLED = 'false';
    appendAuditArchive({
      id: randomUUID(),
      actor_id: null,
      action: 'noop',
      resource_id: 'x',
      details: {},
      created_at: '2026-09-10T12:00:00.000Z',
    });
    expect(verifyAuditArchiveDay('2026-09-10').lines).toBe(0);
  });
});
