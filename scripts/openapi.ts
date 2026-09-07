import { writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { UsageSchema, PolicySchema } from '../packages/domain/src/index.js';
const uuid = { type: 'string', format: 'uuid' },
  string = { type: 'string' },
  bool = { type: 'boolean' },
  integer = { type: 'integer' };
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
const bodySchemas: Record<string, unknown> = {
  'auth/sandbox': obj({
    role: { type: 'string', enum: ['buyer', 'creator', 'admin', 'viewer', 'other', 'new_creator'] },
  }),
  organizations: obj({
    legal_name: { type: 'string', minLength: 3, maxLength: 100 },
    country: { enum: ['ES', 'DE'], type: 'string' },
  }),
  creators: obj({ display_name: string, bio: string, location: string, policy: ref('Policy') }),
  'assets/:id/policies': ref('Policy'),
  'assets/:id/consent': obj({
    document_hash: { type: 'string', minLength: 64, maxLength: 64 },
    accepted: { const: true, type: 'boolean' },
  }),
  'assets/:id/files': obj({
    base64: { type: 'string', maxLength: 2800000 },
    mime_type: { type: 'string', enum: ['image/png', 'image/jpeg'] },
  }),
  'license-requests': obj({ organization_id: uuid, asset_id: uuid, usage: ref('Usage') }),
  'license-requests/:id/decision': obj({
    decision: { enum: ['approve', 'reject'], type: 'string' },
    usage_hash: { type: 'string', minLength: 64, maxLength: 64 },
  }),
  quotes: obj({ request_id: uuid }),
  orders: obj({ quote_id: uuid }),
  'orders/:id/acceptance': obj({
    document_hash: { type: 'string', minLength: 64, maxLength: 64 },
    accepted: { const: true, type: 'boolean' },
  }),
  'orders/:id/simulate-payment': obj({ success: bool }),
  incidents: obj(
    {
      asset_id: uuid,
      license_id: uuid,
      category: { enum: ['rights', 'misuse', 'payment', 'other'], type: 'string' },
      details: { type: 'string', minLength: 10, maxLength: 2000 },
    },
    ['category', 'details'],
  ),
  'admin/assets/:id/review': obj({
    decision: { enum: ['approve', 'reject'], type: 'string' },
    reason: { type: 'string', minLength: 10, maxLength: 1000 },
  }),
  'admin/licenses/:id/status': obj({
    status: { enum: ['issued', 'suspended', 'revoked'], type: 'string' },
    reason: { type: 'string', minLength: 10, maxLength: 1000 },
  }),
};
const content = await readFile('apps/api/src/modules/controllers.ts', 'utf8');
const paths: Record<string, Record<string, unknown>> = {};
const groups = content.split(/@Controller\(['"]([^'"]+)['"]\)/);
for (let i = 1; i < groups.length; i += 2) {
  const prefix = groups[i];
  for (const match of groups[i + 1].matchAll(/@(Get|Post|Delete)\(['"]([^'"]+)['"]\)/g)) {
    const method = match[1].toLowerCase(),
      route = (prefix.replace(/^v1\/?/, '') + '/' + match[2]).replace(/^\//, '');
    const path = '/v1/' + route.replace(/:([a-z_]+)/g, '{$1}');
    const params = [...route.matchAll(/:([a-z_]+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: m[1] === 'id' ? uuid : string,
    }));
    if (route === 'search')
      for (const key of [
        'q',
        'category',
        'territory',
        'channel',
        'approval',
        'duration',
        'cursor',
        'limit',
        'max_price',
      ])
        params.push({
          name: key,
          in: 'query',
          required: false,
          schema: key === 'limit' || key === 'max_price' ? integer : string,
        });
    const isPublic =
      ['health', 'config', 'search', 'auth/sandbox', 'public/signing-key'].includes(route) ||
      route.startsWith('public/') ||
      route.startsWith('webhooks/') ||
      (['assets/:id', 'assets/:id/passport'].includes(route) && method === 'get');
    let schema = bodySchemas[route];
    if (route.startsWith('admin/') && !schema && method === 'post')
      schema = obj({ reason: { type: 'string', minLength: 10, maxLength: 1000 } });
    const code =
      method === 'post' && !route.startsWith('auth/') && !route.startsWith('webhooks/')
        ? '201'
        : '200';
    const responseSchema =
      route === 'license-requests' && method === 'post'
        ? ref('Decision')
        : route === 'quotes' && method === 'post'
          ? ref('Quote')
          : route === 'public/licenses/:token/verify'
            ? ref('Verification')
            : route === 'search'
              ? obj({
                  items: { type: 'array', items: ref('Asset') },
                  next_cursor: { type: ['string', 'null'] },
                  sandbox: bool,
                })
              : route === 'assets/:id'
                ? ref('Asset')
                : { type: 'object', additionalProperties: true };
    paths[path] ??= {};
    paths[path][method] = {
      operationId: method + '_' + route.replace(/[:/]/g, '_'),
      summary: route,
      security: isPublic ? [] : [{ bearerAuth: [] }],
      parameters: [
        ...params,
        ...(method === 'post' && !route.startsWith('auth/') && !route.startsWith('webhooks/')
          ? [
              {
                name: 'Idempotency-Key',
                in: 'header',
                required: !route.endsWith('/checkout') && !route.endsWith('/simulate-payment'),
                schema: { type: 'string', minLength: 8, maxLength: 128 },
              },
            ]
          : []),
      ],
      ...(schema
        ? { requestBody: { required: true, content: { 'application/json': { schema } } } }
        : {}),
      responses: {
        [code]: {
          description: 'Success',
          content: { 'application/json': { schema: responseSchema } },
        },
        '401': {
          description: 'Unauthenticated',
          content: { 'application/json': { schema: ref('Error') } },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Unknown or inaccessible resource' },
        '409': { description: 'State/idempotency conflict' },
        '422': { description: 'Invalid input or policy decision' },
        '429': { description: 'Rate limited' },
        '503': { description: 'Provider unavailable' },
      },
    };
  }
}
const schemas = {
  Usage: z.toJSONSchema(UsageSchema),
  Policy: z.toJSONSchema(PolicySchema),
  Price: obj({
    base_minor: integer,
    fee_minor: integer,
    creator_minor: integer,
    total_minor: integer,
    currency: { const: 'EUR', type: 'string' },
    fee_bps: integer,
    tax_minor: integer,
    tax_mode: string,
  }),
  Decision: obj({
    id: uuid,
    decision: { enum: ['ALLOW', 'DENY', 'REQUIRES_APPROVAL'], type: 'string' },
    reason_codes: { type: 'array', items: string },
    usage_hash: string,
    policy_hash: string,
  }),
  Quote: obj({
    id: uuid,
    scope: ref('Usage'),
    price: ref('Price'),
    expires_at: { type: 'string', format: 'date-time' },
  }),
  Asset: {
    type: 'object',
    properties: {
      id: uuid,
      display_name: string,
      portrait: string,
      bio: string,
      location: string,
      policy: ref('Policy'),
      policy_hash: string,
      policy_version: integer,
      status: string,
      identity_status: string,
      relationship_status: string,
    },
    required: ['id', 'display_name', 'policy'],
    additionalProperties: true,
  },
  Verification: obj({
    license_id: uuid,
    status: {
      enum: ['VALID', 'NOT_YET_VALID', 'EXPIRED', 'REVOKED', 'SUSPENDED', 'INVALID'],
      type: 'string',
    },
    signature_valid: bool,
    starts_at: string,
    ends_at: string,
    scope: ref('Usage'),
    key_id: string,
    checked_at: string,
    sandbox: bool,
  }),
  Error: obj({
    error: obj(
      {
        code: string,
        message: string,
        details: { type: 'object', additionalProperties: true },
        request_id: string,
      },
      ['code', 'message'],
    ),
  }),
};
await writeFile(
  'packages/contracts/openapi.json',
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'RightsNet Sandbox API',
        version: '0.1.0',
        description:
          'Internal sandbox contract. No commercial rights or production commerce. Administrative aggregate responses remain extensible.',
      },
      servers: [{ url: 'http://127.0.0.1:4000' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas },
      paths,
    },
    null,
    2,
  ) + '\n',
);
console.log('OpenAPI written:', Object.keys(paths).length, 'paths');
