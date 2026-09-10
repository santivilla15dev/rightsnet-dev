import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type AuditArchiveRecord = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_id: string;
  details: unknown;
  created_at: string;
};

export type AuditArchiveLine = AuditArchiveRecord & {
  prev_hash: string;
  hash: string;
};

function archiveRoot() {
  return path.resolve(process.env.AUDIT_ARCHIVE_DIR ?? '.local/audit-archive');
}

export function auditArchiveEnabled() {
  return process.env.AUDIT_ARCHIVE_ENABLED !== 'false';
}

function dayFile(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('AUDIT_ARCHIVE_BAD_DAY');
  return path.join(archiveRoot(), `${day}.jsonl`);
}

function hashLine(prevHash: string, body: AuditArchiveRecord): string {
  const payload = JSON.stringify({
    prev_hash: prevHash,
    id: body.id,
    actor_id: body.actor_id,
    action: body.action,
    resource_id: body.resource_id,
    details: body.details,
    created_at: body.created_at,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function lastHash(filePath: string): string {
  if (!existsSync(filePath)) return '0'.repeat(64);
  const text = readFileSync(filePath, 'utf8').trimEnd();
  if (!text) return '0'.repeat(64);
  const last = text.split('\n').at(-1);
  if (!last) return '0'.repeat(64);
  const parsed = JSON.parse(last) as AuditArchiveLine;
  return typeof parsed.hash === 'string' ? parsed.hash : '0'.repeat(64);
}

/** Append-only JSONL with hash chain. Sync I/O so it stays in the audit txn path. */
export function appendAuditArchive(record: AuditArchiveRecord) {
  if (!auditArchiveEnabled()) return;
  const day = record.created_at.slice(0, 10);
  const root = archiveRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const filePath = dayFile(day);
  const prev = lastHash(filePath);
  const hash = hashLine(prev, record);
  const line: AuditArchiveLine = { ...record, prev_hash: prev, hash };
  appendFileSync(filePath, JSON.stringify(line) + '\n', { mode: 0o600 });
}

export type AuditArchiveVerifyResult = {
  day: string;
  ok: boolean;
  lines: number;
  error?: string;
};

export function verifyAuditArchiveDay(day: string): AuditArchiveVerifyResult {
  const filePath = dayFile(day);
  if (!existsSync(filePath)) return { day, ok: true, lines: 0 };
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  let prev = '0'.repeat(64);
  for (let i = 0; i < lines.length; i++) {
    let parsed: AuditArchiveLine;
    try {
      parsed = JSON.parse(lines[i]!) as AuditArchiveLine;
    } catch {
      return { day, ok: false, lines: i, error: `JSON_AT_${i}` };
    }
    if (parsed.prev_hash !== prev)
      return { day, ok: false, lines: i, error: `PREV_HASH_MISMATCH_AT_${i}` };
    const expect = hashLine(prev, {
      id: parsed.id,
      actor_id: parsed.actor_id,
      action: parsed.action,
      resource_id: parsed.resource_id,
      details: parsed.details,
      created_at: parsed.created_at,
    });
    if (parsed.hash !== expect)
      return { day, ok: false, lines: i, error: `HASH_MISMATCH_AT_${i}` };
    prev = parsed.hash;
  }
  return { day, ok: true, lines: lines.length };
}
