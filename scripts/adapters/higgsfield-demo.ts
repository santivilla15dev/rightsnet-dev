#!/usr/bin/env tsx
/**
 * Founder/demo CLI: Higgsfield sandbox adapter (authorize → stub HF → report).
 *
 * Requires:
 *   HIGGSFIELD_ADAPTER_ENABLED=true
 *   HIGGSFIELD_MODE=sandbox (default)
 *   DATABASE_URL pointing at a migrated+seeded DB
 *   Cleared ACTIVE RightsGrant for org+asset (seed/demo fixtures often need approval)
 *
 * Usage:
 *   pnpm exec tsx scripts/adapters/higgsfield-demo.ts \
 *     --organization-id <uuid> --asset-id <uuid> [--territory DE] [--industry beauty]
 */
import 'dotenv/config';
import { pool } from '../../packages/db/index.js';
import { config } from '../../apps/api/src/common/config.js';
import { runHiggsfieldSandboxAdapter } from '../../apps/api/src/modules/adapters/higgsfield.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!config.higgsfieldAdapterEnabled) {
    console.error('Set HIGGSFIELD_ADAPTER_ENABLED=true to run this demo.');
    process.exit(1);
  }
  const organization_id = arg('--organization-id');
  const asset_id = arg('--asset-id');
  if (!organization_id || !asset_id) {
    console.error(
      'Usage: tsx scripts/adapters/higgsfield-demo.ts --organization-id <uuid> --asset-id <uuid>',
    );
    process.exit(1);
  }

  const result = await runHiggsfieldSandboxAdapter({
    organization_id,
    asset_id,
    use: {
      content_type: arg('--content-type') ?? 'synthetic_video',
      purpose: 'commercial_advertising',
      territory: arg('--territory') ?? 'DE',
      industry: arg('--industry') ?? 'beauty',
    },
    brief: arg('--brief') ?? 'sandbox demo brief',
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
