import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import {
  PolicySchema,
  RightsPolicySchema,
  DomainError,
  type RightsPolicy,
} from '../../../../packages/domain/src/index.js';
import type { Actor } from '../common/auth.js';
import {
  isRightsPolicy,
  policyContentHash,
  rightsCorePurchasesEnabled,
} from './rights-core-path.js';
import { projectPublicPassport, samplePrivatePassport } from '../../../../packages/domain/src/index.js';

function parseIncomingPolicy(body: unknown) {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  // Preserve existing asset schema: legacy ES creators keep policy/0.1 updates even when
  // Rights Core purchases are enabled for new / AT-DE assets.
  if (raw.schema_version === 'rightsnet.policy/0.1') {
    return PolicySchema.parse(body);
  }
  if (raw.schema_version === 'rightsnet.rights-policy/0.1' || rightsCorePurchasesEnabled()) {
    return RightsPolicySchema.parse({
      ...raw,
      policy_id: raw.policy_id ?? '00000000-0000-4000-8000-000000000001',
      asset_id: raw.asset_id ?? '00000000-0000-4000-8000-000000000002',
      creator_id: raw.creator_id ?? '00000000-0000-4000-8000-000000000003',
    });
  }
  return PolicySchema.parse(body);
}
export const assetSelect = `SELECT a.id,a.status,a.relationship_status,a.policy_id,c.id as creator_id,c.user_id,c.display_name,c.bio,c.location,c.languages,c.gender,c.age_band,c.public_slug,c.portrait,c.identity_status,c.identity_expires_at,c.adult_verified,c.connected_account,p.payload as policy,p.version as policy_version,p.sha256 as policy_hash FROM assets a JOIN creators c ON c.id=a.creator_id JOIN policies p ON p.id=a.policy_id`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAssetUuid(id: string) {
  return UUID_RE.test(id);
}

export function slugifyDisplayName(name: string) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function allocatePublicSlug(db: DB, displayName: string) {
  const base = slugifyDisplayName(displayName) || 'creator';
  let candidate = base;
  let n = 0;
  for (;;) {
    const taken = (
      await db.query('SELECT 1 FROM creators WHERE public_slug=$1 LIMIT 1', [candidate])
    ).rowCount;
    if (!taken) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function getAsset(db: DB, idOrSlug: string, owner?: Actor) {
  const byUuid = isAssetUuid(idOrSlug);
  const a = (
    await db.query(
      assetSelect + (byUuid ? ' WHERE a.id=$1' : ' WHERE c.public_slug=$1'),
      [idOrSlug],
    )
  ).rows[0];
  if (!a || (a.status !== 'published' && owner?.id !== a.user_id && owner?.role !== 'admin'))
    throw new DomainError('NOT_FOUND', 404);
  return a;
}
export async function ownedAsset(db: DB, id: string, user: Actor) {
  const a = (await db.query(assetSelect + ' WHERE a.id=$1 FOR UPDATE OF a', [id])).rows[0];
  if (!a || a.user_id !== user.id) throw new DomainError('NOT_FOUND', 404);
  return a;
}
export function publicAsset(a: Record<string, unknown>) {
  const {
    user_id: _user,
    connected_account: _account,
    identity_expires_at: _expires,
    adult_verified: _adult,
    ...rest
  } = a;
  return rest;
}
export async function search(query: Record<string, unknown>) {
  const schema = z
    .object({
      q: z.string().max(100).optional(),
      category: z.string().max(30).optional(),
      territory: z.string().max(2).optional(),
      channel: z.string().max(20).optional(),
      duration: z.enum(['30', '90']).optional(),
      max_price: z.coerce.number().int().min(0).max(10000000).optional(),
      approval: z.enum(['automatic', 'manual']).optional(),
      gender: z.enum(['female', 'male', 'non_binary', 'unspecified']).optional(),
      age_band: z.enum(['18_24', '25_34', '35_44', '45_plus']).optional(),
      language: z.string().min(2).max(8).optional(),
      location: z.string().max(80).optional(),
      ai_usage: z.enum(['synthetic_image', 'synthetic_video']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      cursor: z.uuid().optional(),
    })
    .strict();
  const f = schema.parse(query),
    args: unknown[] = [];
  let sql =
    assetSelect +
    " WHERE a.status='published' AND a.relationship_status='reviewed' AND c.identity_status='verified' AND c.identity_expires_at>now() AND c.adult_verified=true";
  const add = (value: unknown, clause: string) => {
    args.push(value);
    sql += ' AND ' + clause.replaceAll('?', `$${args.length}`);
  };
  if (f.q) add('%' + f.q + '%', '(c.display_name ILIKE ? OR c.bio ILIKE ? OR c.location ILIKE ?)');
  if (f.location) add('%' + f.location + '%', 'c.location ILIKE ?');
  if (f.gender) add(f.gender, 'c.gender = ?');
  if (f.age_band) add(f.age_band, 'c.age_band = ?');
  if (f.language) add(f.language, '? = ANY(c.languages)');
  if (f.category) {
    args.push(f.category, f.category);
    sql += ` AND (p.payload->'categories' @> to_jsonb(ARRAY[$${args.length - 1}]::text[]) OR (p.payload->'industries'->>$${args.length}) = 'ALLOW' OR (p.payload->'industries'->>$${args.length}) = 'REQUIRES_APPROVAL')`;
  }
  if (f.territory) {
    args.push(f.territory, f.territory);
    sql += ` AND (p.payload->'territories' @> to_jsonb(ARRAY[$${args.length - 1}]::text[]) OR (p.payload->'territories'->>$${args.length}) IN ('ALLOW','REQUIRES_APPROVAL'))`;
  }
  if (f.channel) {
    args.push(f.channel, f.channel);
    sql += ` AND (p.payload->'channels' @> to_jsonb(ARRAY[$${args.length - 1}]::text[]) OR (p.payload->'channels'->>$${args.length}) IN ('ALLOW','REQUIRES_APPROVAL'))`;
  }
  if (f.ai_usage) {
    args.push(f.ai_usage, f.ai_usage);
    sql += ` AND (p.payload->'operations' @> to_jsonb(ARRAY[$${args.length - 1}]::text[]) OR (p.payload->'operations'->>$${args.length}) IN ('ALLOW','REQUIRES_APPROVAL'))`;
  }
  if (f.approval) {
    args.push(f.approval, f.approval.toUpperCase());
    sql += ` AND (p.payload->>'approval' = $${args.length - 1} OR p.payload->>'approval_mode' = $${args.length})`;
  }
  if (f.max_price !== undefined) {
    const d = f.duration ?? '30';
    args.push(f.max_price);
    sql += ` AND COALESCE((p.payload->'prices'->>'${d}')::bigint, (p.payload->'pricing'->'duration_prices_minor'->>'${d}')::bigint) <= $${args.length}`;
  }
  if (f.cursor) add(f.cursor, 'a.id > ?::uuid');
  args.push(f.limit + 1);
  sql += ' ORDER BY a.id LIMIT $' + args.length;
  const rows = (await pool.query(sql, args)).rows;
  return {
    items: rows.slice(0, f.limit).map(publicAsset),
    next_cursor: rows.length > f.limit ? rows[f.limit - 1].id : null,
    sandbox: true,
  };
}
export async function createCreator(db: DB, user: Actor, body: unknown) {
  const base = z
    .object({
      display_name: z.string().trim().min(2).max(60),
      bio: z.string().trim().min(20).max(600),
      location: z.string().trim().min(2).max(80),
      gender: z.enum(['female', 'male', 'non_binary', 'unspecified']).optional(),
      age_band: z.enum(['18_24', '25_34', '35_44', '45_plus']).optional(),
      languages: z.array(z.string().min(2).max(8)).min(1).max(5).optional(),
      policy: z.unknown(),
    })
    .strict()
    .parse(body);
  const policy = parseIncomingPolicy(base.policy);
  const existing = (await db.query('SELECT id FROM creators WHERE user_id=$1', [user.id])).rows[0];
  if (existing)
    throw new DomainError(
      'PROFILE_EXISTS',
      409,
      'Ya tienes un perfil. Edita sus derechos desde tu panel.',
    );
  const cid = randomUUID(),
    aid = randomUUID(),
    pid = randomUUID();
  let storedPolicy = policy;
  if (isRightsPolicy(policy)) {
    storedPolicy = {
      ...policy,
      policy_id: pid,
      asset_id: aid,
      creator_id: cid,
    } satisfies RightsPolicy;
    RightsPolicySchema.parse(storedPolicy);
  }
  const digest = policyContentHash(storedPolicy);
  const gender = base.gender ?? 'unspecified';
  const ageBand = base.age_band ?? '25_34';
  const languages = base.languages?.length ? base.languages : ['es'];
  const publicSlug = await allocatePublicSlug(db, base.display_name);
  await db.query(
    'INSERT INTO creators(id,user_id,display_name,bio,location,portrait,languages,gender,age_band,public_slug) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      cid,
      user.id,
      base.display_name,
      base.bio,
      base.location,
      '/portraits/creator-3.svg',
      languages,
      gender,
      ageBand,
      publicSlug,
    ],
  );
  await db.query('INSERT INTO assets(id,creator_id) VALUES($1,$2)', [aid, cid]);
  await db.query('INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,1,$3,$4)', [
    pid,
    aid,
    JSON.stringify(storedPolicy),
    digest,
  ]);
  await db.query('UPDATE assets SET policy_id=$1 WHERE id=$2', [pid, aid]);
  await audit(db, user.id, 'creator.created', aid);
  return { id: aid, policy_id: pid, policy_hash: digest };
}
export async function updatePolicy(db: DB, user: Actor, id: string, body: unknown) {
  const policy = parseIncomingPolicy(body);
  const a = await ownedAsset(db, id, user);
  const pid = randomUUID();
  let storedPolicy = policy;
  if (isRightsPolicy(policy)) {
    storedPolicy = {
      ...policy,
      policy_id: pid,
      asset_id: id,
      creator_id: a.creator_id,
      revision: a.policy_version + 1,
      supersedes_policy_id: a.policy_id,
    } satisfies RightsPolicy;
    RightsPolicySchema.parse(storedPolicy);
  }
  const digest = policyContentHash(storedPolicy);
  await db.query(
    'INSERT INTO policies(id,asset_id,version,payload,sha256) VALUES($1,$2,$3,$4,$5)',
    [pid, id, a.policy_version + 1, JSON.stringify(storedPolicy), digest],
  );
  await db.query(
    "UPDATE assets SET policy_id=$1,status=CASE WHEN status='suspended' THEN 'suspended' ELSE 'draft' END WHERE id=$2",
    [pid, id],
  );
  await audit(db, user.id, 'policy.version.created', pid);
  return { id: pid, sha256: digest, version: a.policy_version + 1 };
}
export async function consent(db: DB, user: Actor, id: string, body: unknown) {
  const data = z
    .object({ document_hash: z.string().length(64), accepted: z.literal(true) })
    .strict()
    .parse(body);
  const a = await ownedAsset(db, id, user);
  if (data.document_hash !== a.policy_hash) throw new DomainError('DOCUMENT_CHANGED', 409);
  const terms = isRightsPolicy(a.policy) ? a.policy.license_terms_version : null;
  await db.query(
    'INSERT INTO consents(id,policy_id,user_id,document_hash,license_terms_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(policy_id,user_id) DO NOTHING',
    [randomUUID(), a.policy_id, user.id, a.policy_hash, terms],
  );
  await audit(db, user.id, 'consent.accepted', a.policy_id);
  return { accepted: true };
}

/** Public Rights Passport (allowlist) for rights-policy assets; legacy keeps thin passport. */
export async function publicPassportForAsset(assetId: string) {
  const a = await getAsset(pool, assetId);
  if (isRightsPolicy(a.policy)) {
    const pub = projectPublicPassport({
      ...samplePrivatePassport(a.policy),
      passport_id: a.id,
      revision: a.policy_version,
      asset_id: a.id,
      asset_version: a.policy_version,
      creator_id: a.creator_id,
      policy_id: a.policy_id,
      policy_revision: a.policy.revision,
      policy_hash: a.policy_hash,
      public_display_name: a.display_name,
      public_profile_slug: String(a.display_name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      identity_verification_level: a.identity_status === 'verified' ? 'strong' : 'none',
      relationship_verification_level: a.relationship_status === 'reviewed' ? 'strong' : 'none',
    });
    return { ...pub, sandbox: true };
  }
  return {
    schema_version: 'rightsnet.passport/0.1',
    asset_id: a.id,
    version: a.policy_version,
    policy_hash: a.policy_hash,
    identity_status: a.identity_status,
    relationship_status: a.relationship_status,
    policy: a.policy,
    sandbox: true,
  };
}
export async function publish(db: DB, user: Actor, id: string) {
  const a = await ownedAsset(db, id, user);
  if (a.status === 'suspended') throw new DomainError('ASSET_SUSPENDED', 409);
  const consented = (
    await db.query('SELECT 1 FROM consents WHERE policy_id=$1 AND user_id=$2', [
      a.policy_id,
      user.id,
    ])
  ).rowCount;
  if (!consented) throw new DomainError('CONSENT_REQUIRED', 422);
  if (
    a.identity_status !== 'verified' ||
    !a.adult_verified ||
    new Date(a.identity_expires_at) <= new Date() ||
    a.relationship_status !== 'reviewed' ||
    !a.connected_account
  )
    throw new DomainError(
      'VERIFICATION_REQUIRED',
      422,
      'Completa la verificación antes de publicar.',
    );
  await db.query("UPDATE assets SET status='published' WHERE id=$1", [id]);
  await audit(db, user.id, 'asset.published', id);
  return { status: 'published' };
}
