import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, audit, type DB } from '../../../../packages/db/index.js';
import {
  UsageSchema,
  evaluateLicense,
  evaluateRightsDecision,
  DraftLicenseRequestSchema,
  RightsPolicySchema,
  rightsHash,
  hash,
  DomainError,
  assertIssuanceAllowed,
  type Policy,
  type Usage,
  type RightsPolicy,
  type LicenseRequest,
} from '../../../../packages/domain/src/index.js';
import { member, type Actor } from '../common/auth.js';
import { getAsset } from './marketplace.js';
import {
  approvalFromRow,
  buildTrustedContext,
  ensureSandboxSafetyCleared,
  isRightsPolicy,
  policyContentHash,
  priceForPolicy,
} from './rights-core-path.js';

function durationFromScope(scope: Record<string, unknown>): 30 | 90 {
  const d = scope.duration_days;
  if (d === 30 || d === 90) return d;
  throw new DomainError('INVALID_SCOPE', 422);
}

/** Anonymous / pre-auth Rights Check. Does not persist a request. */
export async function previewRightsCheck(db: DB, body: unknown) {
  const base = z
    .object({
      asset_id: z.string().min(1).max(80),
      usage: z.unknown().optional(),
      request: z.unknown().optional(),
    })
    .strict()
    .parse(body);
  const a = await getAsset(db, base.asset_id);
  const now = new Date().toISOString();
  const previewOrgId = '00000000-0000-4000-8000-ffffffffffff';

  if (isRightsPolicy(a.policy)) {
    const policy = RightsPolicySchema.parse(a.policy);
    const draft = DraftLicenseRequestSchema.parse({
      schema_version: 'rightsnet.license-request/0.1',
      ...(typeof base.request === 'object' && base.request ? base.request : {}),
      ...(typeof base.usage === 'object' && base.usage && !base.request ? base.usage : {}),
      request_id: randomUUID(),
      buyer_organization_id: previewOrgId,
      creator_id: a.creator_id,
      asset_id: a.id,
      policy_id: a.policy_id,
    });
    const requestHash = rightsHash(draft);
    const context = await buildTrustedContext({
      db,
      org: { verified: true },
      asset: { ...a, policy },
      requestHash,
      safetyOverride: {
        assessor: 'platform',
        source: 'sandbox',
        version: 'safety/0.1',
        assessed_at: now,
        request_hash: requestHash,
        status: 'CLEARED',
        reason_codes: [],
      },
    });
    const decision = evaluateRightsDecision({
      policy,
      request: draft,
      context,
      now,
    });
    return {
      preview: true as const,
      decision: decision.decision,
      reason_codes: decision.reason_codes,
      missing_fields: decision.missing_fields,
      usage_hash: decision.request_hash,
      request_hash: decision.request_hash,
    };
  }

  if (!base.usage) throw new DomainError('USAGE_REQUIRED', 422);
  const usage = UsageSchema.parse(base.usage);
  const decision = evaluateLicense({
    buyerVerified: true,
    assetAvailable: a.status === 'published',
    verificationValid:
      a.identity_status === 'verified' &&
      a.adult_verified &&
      new Date(a.identity_expires_at) > new Date(),
    policy: a.policy,
    usage,
    now,
  });
  return {
    preview: true as const,
    decision: decision.decision,
    reason_codes: decision.reason_codes,
    missing_fields: [] as string[],
    usage_hash: decision.usage_hash,
    request_hash: decision.usage_hash,
  };
}

export async function createRequest(db: DB, user: Actor, body: unknown) {
  const base = z
    .object({
      organization_id: z.uuid(),
      asset_id: z.uuid(),
      usage: z.unknown().optional(),
      request: z.unknown().optional(),
    })
    .strict()
    .parse(body);
  await member(db, user, base.organization_id, true);
  const a = await getAsset(db, base.asset_id, user);
  const org = (await db.query('SELECT * FROM organizations WHERE id=$1', [base.organization_id]))
    .rows[0];

  if (isRightsPolicy(a.policy)) {
    return createRightsCoreRequest(db, user, {
      organization_id: base.organization_id,
      asset_id: base.asset_id,
      requestBody: base.request ?? base.usage,
      asset: a,
      org,
    });
  }

  if (!base.usage) throw new DomainError('USAGE_REQUIRED', 422);
  const usage = UsageSchema.parse(base.usage);
  const decision = evaluateLicense({
    buyerVerified: org.verified,
    assetAvailable: a.status === 'published',
    verificationValid:
      a.identity_status === 'verified' &&
      a.adult_verified &&
      new Date(a.identity_expires_at) > new Date(),
    policy: a.policy,
    usage,
    now: new Date().toISOString(),
  });
  const id = randomUUID();
  await db.query(
    'INSERT INTO requests(id,organization_id,asset_id,policy_id,usage,usage_hash,decision,reason_codes,missing_fields,engine_version,policy_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [
      id,
      base.organization_id,
      base.asset_id,
      a.policy_id,
      JSON.stringify(usage),
      decision.usage_hash,
      decision.decision,
      JSON.stringify(decision.reason_codes),
      JSON.stringify([]),
      null,
      a.policy_hash,
    ],
  );
  await audit(db, user.id, 'request.evaluated', id, { decision: decision.decision });
  return {
    id,
    ...decision,
    usage_hash: decision.usage_hash,
    request_hash: decision.usage_hash,
  };
}

async function createRightsCoreRequest(
  db: DB,
  user: Actor,
  input: {
    organization_id: string;
    asset_id: string;
    requestBody: unknown;
    asset: Awaited<ReturnType<typeof getAsset>>;
    org: { verified: boolean };
  },
) {
  const policy = RightsPolicySchema.parse(input.asset.policy);
  const draft = DraftLicenseRequestSchema.parse({
    schema_version: 'rightsnet.license-request/0.1',
    ...(typeof input.requestBody === 'object' && input.requestBody ? input.requestBody : {}),
    request_id: randomUUID(),
    buyer_organization_id: input.organization_id,
    creator_id: input.asset.creator_id,
    asset_id: input.asset_id,
    policy_id: input.asset.policy_id,
  });
  const now = new Date().toISOString();
  const requestHash = rightsHash(draft);
  const id = draft.request_id;

  // Persist request first so safety assessment can FK to it
  await db.query(
    'INSERT INTO requests(id,organization_id,asset_id,policy_id,usage,usage_hash,decision,reason_codes,missing_fields,engine_version,policy_hash,platform_policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [
      id,
      input.organization_id,
      input.asset_id,
      input.asset.policy_id,
      JSON.stringify(draft),
      requestHash,
      'INCOMPLETE',
      JSON.stringify(['PENDING_EVAL']),
      JSON.stringify([]),
      'rightsnet.engine/0.1',
      policyContentHash(policy),
      policy.platform_policy_version,
    ],
  );
  await ensureSandboxSafetyCleared(db, id, requestHash, now);
  const context = await buildTrustedContext({
    db,
    org: input.org,
    asset: { ...input.asset, policy },
    requestHash,
  });
  const decision = evaluateRightsDecision({
    policy,
    request: draft,
    context,
    now,
  });
  await db.query(
    'UPDATE requests SET decision=$1,reason_codes=$2,missing_fields=$3,usage_hash=$4,policy_hash=$5 WHERE id=$6',
    [
      decision.decision,
      JSON.stringify(decision.reason_codes),
      JSON.stringify(decision.missing_fields),
      decision.request_hash,
      decision.policy_hash,
      id,
    ],
  );
  await audit(db, user.id, 'request.evaluated', id, {
    decision: decision.decision,
    engine: 'rights-core',
  });
  return {
    id,
    ...decision,
    usage_hash: decision.request_hash,
    request_hash: decision.request_hash,
  };
}

export async function approveRequest(db: DB, user: Actor, id: string, body: unknown) {
  const data = z
    .object({ decision: z.enum(['approve', 'reject']), usage_hash: z.string().length(64) })
    .strict()
    .parse(body);
  const r = (
    await db.query(
      'SELECT r.*,c.user_id,p.sha256,p.payload as policy FROM requests r JOIN assets a ON a.id=r.asset_id JOIN creators c ON c.id=a.creator_id JOIN policies p ON p.id=r.policy_id WHERE r.id=$1 FOR UPDATE OF r',
      [id],
    )
  ).rows[0];
  if (!r || r.user_id !== user.id) throw new DomainError('NOT_FOUND', 404);
  if (data.usage_hash !== r.usage_hash) throw new DomainError('USAGE_CHANGED', 409);
  if (r.decision !== 'REQUIRES_APPROVAL') throw new DomainError('INVALID_STATE', 409);

  if (isRightsPolicy(r.policy)) {
    return approveRightsCoreRequest(db, user, r, data.decision);
  }

  await db.query(
    "INSERT INTO approvals(id,request_id,actor_id,usage_hash,policy_hash,decision,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours')",
    [randomUUID(), id, user.id, r.usage_hash, r.sha256, data.decision],
  );
  await db.query('UPDATE requests SET decision=$1,reason_codes=$2 WHERE id=$3', [
    data.decision === 'approve' ? 'ALLOW' : 'DENY',
    JSON.stringify(data.decision === 'approve' ? [] : ['CREATOR_DECLINED']),
    id,
  ]);
  await audit(db, user.id, 'request.' + data.decision, id);
  return {
    decision: data.decision === 'approve' ? 'ALLOW' : 'DENY',
    reason_codes: data.decision === 'approve' ? [] : ['CREATOR_DECLINED'],
    missing_fields: [],
  };
}

async function approveRightsCoreRequest(
  db: DB,
  user: Actor,
  r: Record<string, unknown>,
  decision: 'approve' | 'reject',
) {
  const policy = RightsPolicySchema.parse(r.policy);
  const draft = DraftLicenseRequestSchema.parse(r.usage);
  const a = await getAsset(db, String(r.asset_id), user);
  const org = (await db.query('SELECT * FROM organizations WHERE id=$1', [r.organization_id]))
    .rows[0];
  const now = new Date().toISOString();
  const requestHash = String(r.usage_hash);
  const policyHash = policyContentHash(policy);
  const expires = new Date(Date.now() + 86400000).toISOString();
  await db.query(
    `INSERT INTO approvals(id,request_id,actor_id,usage_hash,policy_hash,decision,expires_at,request_hash,platform_policy_version,buyer_organization_id,asset_id,actor_role,revision)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'creator',1)`,
    [
      randomUUID(),
      r.id,
      user.id,
      requestHash,
      policyHash,
      decision,
      expires,
      requestHash,
      policy.platform_policy_version,
      r.organization_id,
      r.asset_id,
    ],
  );
  const approvalRow = (
    await db.query(
      'SELECT * FROM approvals WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1',
      [r.id],
    )
  ).rows[0];
  const creatorApproval = approvalFromRow(approvalRow, {
    request_id: String(r.id),
    buyer_organization_id: String(r.organization_id),
    asset_id: String(r.asset_id),
    request_hash: requestHash,
    policy_hash: policyHash,
    platform_policy_version: policy.platform_policy_version,
  });
  const context = await buildTrustedContext({
    db,
    org,
    asset: { ...a, policy },
    requestHash,
    creatorApproval,
  });
  const evaluated = evaluateRightsDecision({
    policy,
    request: draft,
    context,
    now,
  });
  await db.query(
    'UPDATE requests SET decision=$1,reason_codes=$2,missing_fields=$3 WHERE id=$4',
    [
      evaluated.decision,
      JSON.stringify(evaluated.reason_codes),
      JSON.stringify(evaluated.missing_fields),
      r.id,
    ],
  );
  await audit(db, user.id, 'request.' + decision, String(r.id), {
    engine: 'rights-core',
    reevaluated: evaluated.decision,
  });
  return {
    decision: evaluated.decision,
    reason_codes: evaluated.reason_codes,
    missing_fields: evaluated.missing_fields,
  };
}

export async function eligibleRequest(db: DB, user: Actor, id: string, opts?: { checkStart?: boolean }) {
  const r = (await db.query('SELECT * FROM requests WHERE id=$1', [id])).rows[0];
  if (!r) throw new DomainError('NOT_FOUND', 404);
  await member(db, user, r.organization_id, true);
  const a = await getAsset(db, r.asset_id, user);
  if (a.policy_id !== r.policy_id)
    throw new DomainError(
      'POLICY_STALE',
      409,
      'Los derechos han cambiado. Crea una nueva solicitud.',
    );
  const org = (await db.query('SELECT * FROM organizations WHERE id=$1', [r.organization_id]))
    .rows[0];

  if (isRightsPolicy(a.policy)) {
    const policy = RightsPolicySchema.parse(a.policy);
    const draft = DraftLicenseRequestSchema.parse(r.usage);
    const approval = (
      await db.query(
        "SELECT * FROM approvals WHERE request_id=$1 AND decision='approve' ORDER BY created_at DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    const requestHash = String(r.usage_hash);
    const creatorApproval = approvalFromRow(approval, {
      request_id: id,
      buyer_organization_id: r.organization_id,
      asset_id: r.asset_id,
      request_hash: requestHash,
      policy_hash: policyContentHash(policy),
      platform_policy_version: policy.platform_policy_version,
    });
    const context = await buildTrustedContext({
      db,
      org,
      asset: { ...a, policy },
      requestHash,
      creatorApproval,
    });
    const decision = evaluateRightsDecision({
      policy,
      request: draft,
      context,
      now: new Date().toISOString(),
      checkStart: opts?.checkStart !== false,
    });
    if (decision.decision !== 'ALLOW' || r.decision === 'DENY')
      throw new DomainError(decision.reason_codes[0] ?? 'REQUEST_DENIED', 422);
    return { r, a, org, rightsDecision: decision };
  }

  const approval = (
    await db.query(
      "SELECT * FROM approvals WHERE request_id=$1 AND decision='approve' ORDER BY created_at DESC LIMIT 1",
      [id],
    )
  ).rows[0];
  const decision = evaluateLicense({
    buyerVerified: org.verified,
    assetAvailable: a.status === 'published',
    verificationValid:
      a.identity_status === 'verified' &&
      a.adult_verified &&
      new Date(a.identity_expires_at) > new Date(),
    policy: a.policy,
    usage: r.usage,
    approval,
    now: new Date().toISOString(),
    checkStart: opts?.checkStart,
  });
  if (decision.decision !== 'ALLOW' || r.decision === 'DENY')
    throw new DomainError(decision.reason_codes[0] ?? 'REQUEST_DENIED', 422);
  return { r, a, org };
}

export async function createQuote(db: DB, user: Actor, body: unknown) {
  const { request_id } = z.object({ request_id: z.uuid() }).strict().parse(body);
  const { r, a } = await eligibleRequest(db, user, request_id);
  const days = durationFromScope(r.usage);
  const id = randomUUID(),
    cost = priceForPolicy(a.policy, days),
    expires = new Date(Date.now() + 3600000).toISOString();
  await db.query(
    'INSERT INTO quotes(id,request_id,scope,price,policy_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id, request_id, JSON.stringify(r.usage), JSON.stringify(cost), a.policy_hash, expires],
  );
  return { id, price: cost, scope: r.usage, expires_at: expires };
}

export async function createOrder(db: DB, user: Actor, body: unknown) {
  const { quote_id } = z.object({ quote_id: z.uuid() }).strict().parse(body);
  const q = (await db.query('SELECT * FROM quotes WHERE id=$1 FOR UPDATE', [quote_id])).rows[0];
  if (!q) throw new DomainError('NOT_FOUND', 404);
  const { r, a, org } = await eligibleRequest(db, user, q.request_id);
  const existing = (await db.query('SELECT * FROM orders WHERE quote_id=$1', [quote_id])).rows[0];
  if (existing) return existing;
  if (new Date(q.expires_at) <= new Date()) throw new DomainError('QUOTE_EXPIRED', 409);
  const id = randomUUID();
  const text = isRightsPolicy(a.policy)
    ? rightsContractText({
        id,
        buyer: org.legal_name,
        seller: a.display_name,
        scope: q.scope,
        price: q.price,
        policy: a.policy,
        policyHash: a.policy_hash,
      })
    : contractText({
        id,
        buyer: org.legal_name,
        seller: a.display_name,
        scope: q.scope,
        price: q.price,
        policy: a.policy,
        policyHash: a.policy_hash,
      });
  const o = (
    await db.query(
      "INSERT INTO orders(id,quote_id,organization_id,asset_id,status,price,scope,policy_snapshot,contract_text,contract_hash,expires_at) VALUES($1,$2,$3,$4,'awaiting_acceptance',$5,$6,$7,$8,$9,$10) RETURNING *",
      [
        id,
        quote_id,
        r.organization_id,
        r.asset_id,
        JSON.stringify(q.price),
        JSON.stringify(q.scope),
        JSON.stringify(a.policy),
        text,
        hash(text),
        q.expires_at,
      ],
    )
  ).rows[0];
  await audit(db, user.id, 'order.created', id);
  return o;
}

function contractText(data: {
  id: string;
  buyer: string;
  seller: string;
  scope: Usage;
  price: { total_minor: number; fee_minor: number; creator_minor: number };
  policy: Policy;
  policyHash: string;
}) {
  return `RIGHTSNET · LICENCIA DE LIKENESS · DEMO v0.1\nDEMO — NO VÁLIDO PARA LICENCIAR. No constituye un contrato comercial real.\n\nOrden: ${data.id}\nComprador y anunciante: ${data.buyer}\nCreador de prueba: ${data.seller}\nCampaña: ${data.scope.campaign_name}\n\nALCANCE\nUso publicitario mediante ${data.scope.operation}. Categoría: ${data.scope.category}.\nTerritorios: ${data.scope.territories.join(', ')}. Canales: ${data.scope.channels.join(', ')}.\nInicio: ${data.scope.starts_at}. Duración: ${data.scope.duration_days} días de 24 horas UTC.\nLicencia no exclusiva, sin sublicencia. Sin clonación de voz, entrenamiento ni fine-tuning.\nCategorías prohibidas: ${data.policy.denied_categories.join(', ')}.\n\nCONTRAPRESTACIÓN SIMULADA\nImporte: ${(data.price.total_minor / 100).toFixed(2)} EUR. Comisión plataforma: ${(data.price.fee_minor / 100).toFixed(2)} EUR. Creador: ${(data.price.creator_minor / 100).toFixed(2)} EUR. Fiscalidad pendiente de configuración.\n\nTRAZABILIDAD\nPolítica: ${data.policyHash}. La emisión requiere confirmación del pago de prueba. Las modificaciones posteriores de la política no reescriben este documento.\n\nLas condiciones de terminación, reclamaciones, jurisdicción y tratamiento fiscal deben sustituirse por una plantilla aprobada antes de activar comercio real. Esta aceptación sirve exclusivamente para probar el flujo técnico.`;
}

function rightsContractText(data: {
  id: string;
  buyer: string;
  seller: string;
  scope: LicenseRequest | Record<string, unknown>;
  price: { total_minor: number; fee_minor: number; creator_minor: number };
  policy: RightsPolicy;
  policyHash: string;
}) {
  const scope = data.scope as LicenseRequest;
  return `RIGHTSNET · RIGHTS-CORE LICENSE DEMO v0.1\nDEMO — NOT A COMMERCIAL CONTRACT.\n\nOrder: ${data.id}\nBuyer: ${data.buyer}\nCreator: ${data.seller}\nCampaign: ${scope.campaign_name}\n\nSCOPE\nIndustry: ${scope.industry}. Generation: ${scope.generation_type}.\nTerritories: ${(scope.territories ?? []).join(', ')}. Channels: ${(scope.channels ?? []).join(', ')}.\nStart: ${scope.starts_at}. Duration: ${scope.duration_days} × 24h UTC days.\nPolicy terms: ${data.policy.license_terms_version}. Platform policy: ${data.policy.platform_policy_version}.\n\nFEE (sandbox)\nGross: ${(data.price.total_minor / 100).toFixed(2)} EUR. Platform: ${(data.price.fee_minor / 100).toFixed(2)} EUR. Creator: ${(data.price.creator_minor / 100).toFixed(2)} EUR.\n\nPolicy hash: ${data.policyHash}. Issuance requires payment confirmation and prior contract acceptance.`;
}

export async function getOrder(db: DB, user: Actor, id: string, write = false) {
  const o = (
    await db.query(
      `SELECT o.*,c.user_id as creator_user_id,c.display_name as creator_name,
              org.legal_name as organization_legal_name
       FROM orders o
       JOIN assets a ON a.id=o.asset_id
       JOIN creators c ON c.id=a.creator_id
       JOIN organizations org ON org.id=o.organization_id
       WHERE o.id=$1`,
      [id],
    )
  ).rows[0];
  if (!o) throw new DomainError('NOT_FOUND', 404);
  if (!write && (user.role === 'admin' || o.creator_user_id === user.id)) return o;
  await member(db, user, o.organization_id, write);
  return o;
}

export async function acceptOrder(db: DB, user: Actor, id: string, body: unknown) {
  const data = z
    .object({ document_hash: z.string().length(64), accepted: z.literal(true) })
    .strict()
    .parse(body);
  await getOrder(db, user, id, true);
  const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (o.contract_hash !== data.document_hash) throw new DomainError('DOCUMENT_CHANGED', 409);
  if (o.status === 'awaiting_payment') return o;
  if (o.status !== 'awaiting_acceptance')
    throw new DomainError('INVALID_STATE', 409, 'Esta orden ya no admite aceptación.');
  if (new Date(o.expires_at) <= new Date())
    throw new DomainError(
      'ORDER_EXPIRED',
      409,
      'Esta orden de prueba caducó. Crea una campaña nueva desde Descubrir talento.',
    );
  await db.query(
    'INSERT INTO contract_acceptances(id,order_id,actor_id,document_hash) VALUES($1,$2,$3,$4)',
    [randomUUID(), id, user.id, data.document_hash],
  );
  await db.query(
    "UPDATE orders SET status='awaiting_payment',accepted_at=now(),accepted_by=$2 WHERE id=$1",
    [id, user.id],
  );
  await audit(db, user.id, 'contract.accepted', id);
  return { status: 'awaiting_payment' };
}

/** Fulfillment recheck for rights-core orders (checkStart=false). Legacy always allowed here. */
export async function assertOrderIssuable(db: DB, orderId: string) {
  const o = (await db.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!o) throw new DomainError('NOT_FOUND', 404);
  if (!isRightsPolicy(o.policy_snapshot)) return { allowed: true as const };

  const q = (await db.query('SELECT * FROM quotes WHERE id=$1', [o.quote_id])).rows[0];
  const r = (await db.query('SELECT * FROM requests WHERE id=$1', [q.request_id])).rows[0];
  const a = (
    await db.query(
      `SELECT a.id,a.status,a.policy_id,a.relationship_status,c.user_id,c.identity_status,c.identity_expires_at,c.adult_verified,c.id as creator_id,p.payload as policy
       FROM assets a JOIN creators c ON c.id=a.creator_id JOIN policies p ON p.id=a.policy_id WHERE a.id=$1`,
      [o.asset_id],
    )
  ).rows[0];
  const org = (await db.query('SELECT * FROM organizations WHERE id=$1', [o.organization_id])).rows[0];
  const policy = RightsPolicySchema.parse(a.policy);
  const draft = DraftLicenseRequestSchema.parse(r.usage);
  const requestHash = String(r.usage_hash);
  const approval = (
    await db.query(
      "SELECT * FROM approvals WHERE request_id=$1 AND decision='approve' ORDER BY created_at DESC LIMIT 1",
      [r.id],
    )
  ).rows[0];
  const creatorApproval = approvalFromRow(approval, {
    request_id: r.id,
    buyer_organization_id: r.organization_id,
    asset_id: r.asset_id,
    request_hash: requestHash,
    policy_hash: policyContentHash(policy),
    platform_policy_version: policy.platform_policy_version,
  });
  const context = await buildTrustedContext({
    db,
    org,
    asset: { ...a, policy },
    requestHash,
    creatorApproval,
  });
  const rightsDecision = evaluateRightsDecision({
    policy,
    request: draft,
    context,
    now: new Date().toISOString(),
    checkStart: false,
  });
  const paid =
    o.status === 'paid' ||
    o.status === 'issuing' ||
    o.status === 'fulfilled' ||
    o.status === 'paid_requires_review';
  const gate = assertIssuanceAllowed({
    payment_succeeded: paid,
    contract_accepted: !!o.accepted_at,
    eligibility: rightsDecision,
    fulfillment_blocked: rightsDecision.decision !== 'ALLOW',
  });
  if (!gate.allowed) {
    return { allowed: false as const, reasons: gate.reasons, review_required: gate.review_required };
  }
  return { allowed: true as const };
}

export async function listRequests(user: Actor) {
  return (
    await pool.query(
      `SELECT r.*,c.display_name,c.portrait,org.legal_name FROM requests r JOIN assets a ON a.id=r.asset_id JOIN creators c ON c.id=a.creator_id JOIN organizations org ON org.id=r.organization_id WHERE c.user_id=$1 OR EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=r.organization_id AND m.user_id=$1) ORDER BY r.created_at DESC LIMIT 100`,
      [user.id],
    )
  ).rows;
}
export async function listOrders(user: Actor) {
  return (
    await pool.query(
      `SELECT o.id,o.status,o.price,o.scope,o.created_at,c.display_name,c.portrait,l.public_token,l.id as license_id FROM orders o JOIN assets a ON a.id=o.asset_id JOIN creators c ON c.id=a.creator_id LEFT JOIN licenses l ON l.order_id=o.id WHERE c.user_id=$1 OR EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.organization_id AND m.user_id=$1) ORDER BY o.created_at DESC LIMIT 100`,
      [user.id],
    )
  ).rows;
}
