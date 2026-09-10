import 'dotenv/config';
export const config = {
  env: process.env.APP_ENV ?? 'sandbox',
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  auth: process.env.AUTH_PROVIDER ?? 'sandbox',
  payments: process.env.PAYMENTS_PROVIDER ?? 'sandbox',
  /** sandbox = simulate; stripe = Stripe Identity Verification Sessions. */
  identity: (process.env.IDENTITY_PROVIDER === 'stripe' ? 'stripe' : 'sandbox') as
    | 'sandbox'
    | 'stripe',
  /**
   * Allow Stripe Identity livemode (create + webhook). Off by default.
   * Does not enable LIVE_COMMERCE_ENABLED or production APP_ENV.
   */
  identityLiveEnabled: process.env.IDENTITY_LIVE_ENABLED === 'true',
  /**
   * Supabase TOTP MFA. Off by default (CI/E2E). Requires AUTH_PROVIDER=supabase.
   * Does not enable live commerce.
   */
  mfaEnabled: process.env.MFA_ENABLED === 'true',
  /**
   * Allow Stripe payment/Connect livemode. Off by default (CI).
   * Does not enable APP_ENV=production or claim legal pilot clearance.
   */
  liveCommerceEnabled: process.env.LIVE_COMMERCE_ENABLED === 'true',
  /** When true, new creator policies must use rightsnet.rights-policy/0.1. Dual-path evaluation always keys off payload schema_version. */
  rightsCorePurchases: process.env.RIGHTS_CORE_PURCHASES === 'true',
  /**
   * RightsNet Connect (partner API under /v1/platform/*). Off by default.
   * Not Stripe Connect. Requires admin Bearer when enabled.
   */
  platformApiEnabled: process.env.PLATFORM_API_ENABLED === 'true',
  /**
   * Optional Higgsfield glue (authorize → stub/live HF → report). Off by default.
   * Live mode needs API key id+secret in env; CI must stay on sandbox.
   */
  higgsfieldAdapterEnabled: process.env.HIGGSFIELD_ADAPTER_ENABLED === 'true',
  higgsfieldMode: (process.env.HIGGSFIELD_MODE === 'live' ? 'live' : 'sandbox') as
    | 'sandbox'
    | 'live',
  /** Official Cloud API base (L1). */
  higgsfieldApiBase: process.env.HIGGSFIELD_API_BASE ?? 'https://api.higgsfield.ai',
  /**
   * Default model path for L1 text→image (no input media).
   * Override with HIGGSFIELD_MODEL_PATH or adapter input.model.
   */
  higgsfieldModelPath:
    process.env.HIGGSFIELD_MODEL_PATH ?? 'higgsfield-ai/soul/v2/standard',
  /** Wall-clock budget for submit+poll in live L1 (ms). */
  higgsfieldPollTimeoutMs: Number(process.env.HIGGSFIELD_POLL_TIMEOUT_MS ?? 300_000),
  /** Shared secret for POST /v1/webhooks/higgsfield (Bearer). Empty = no check (local/tests). */
  higgsfieldWebhookSecret: process.env.HIGGSFIELD_WEBHOOK_SECRET ?? '',
  /** Public HTTPS URL passed as hf_webhook on live submit (L3). */
  higgsfieldWebhookPublicUrl: process.env.HIGGSFIELD_WEBHOOK_PUBLIC_URL ?? '',
  /**
   * Existing Deal OCR live extract (L3). Off by default; CI stays sandbox.
   * Requires OCR_API_BASE + OCR_API_KEY when mode=live.
   */
  ocrLiveEnabled: process.env.OCR_LIVE_ENABLED === 'true',
  ocrApiBase: process.env.OCR_API_BASE ?? '',
  ocrApiKey: process.env.OCR_API_KEY ?? '',
  /**
   * Default Stripe Connect identity country for new recipient accounts when
   * creators.location has no AT/DE/ES suffix. Test/pilot default: at.
   */
  connectDefaultCountry: (process.env.CONNECT_DEFAULT_COUNTRY ?? 'at').toLowerCase(),
  /**
   * Object storage backend. Default `local` (`.local/uploads`).
   * Opt-in `s3` — docs/STORAGE_S3_CLAMAV_V0_1.md (CI stays local).
   */
  storageProvider: (process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'local') as 'local' | 's3',
  /**
   * Malware scan provider. Default `sandbox` (EICAR). Opt-in `clamav`
   * — docs/STORAGE_S3_CLAMAV_V0_1.md (CI stays sandbox).
   */
  malwareScanProvider: (process.env.MALWARE_SCAN_PROVIDER === 'clamav' ? 'clamav' : 'sandbox') as
    | 'sandbox'
    | 'clamav',
  /**
   * Rate limit backend. Default `memory` (per process). Opt-in `redis`
   * — docs/RATE_LIMIT_DISTRIBUTED_V0_1.md.
   */
  rateLimitProvider: (process.env.RATE_LIMIT_PROVIDER === 'redis' ? 'redis' : 'memory') as
    | 'memory'
    | 'redis',
  port: Number(process.env.API_PORT ?? 4000),
};
export function assertConfiguration() {
  if (config.env === 'production')
    throw new Error('Production is blocked until launch gates are complete.');
  if (config.liveCommerceEnabled && config.payments !== 'stripe')
    throw new Error('LIVE_COMMERCE_ENABLED requires PAYMENTS_PROVIDER=stripe.');
  if (config.storageProvider === 's3') {
    const bucket = process.env.S3_BUCKET;
    const ak = process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
    const sk = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !ak || !sk)
      throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET and AWS/S3 access keys.');
  }
  if (config.malwareScanProvider === 'clamav' && !process.env.CLAMAV_HOST)
    throw new Error('MALWARE_SCAN_PROVIDER=clamav requires CLAMAV_HOST.');
  if (config.rateLimitProvider === 'redis' && !process.env.REDIS_URL)
    throw new Error('RATE_LIMIT_PROVIDER=redis requires REDIS_URL.');
  const signingProvider = (process.env.SIGNING_PROVIDER ?? 'local').toLowerCase();
  if (signingProvider !== 'local')
    throw new Error(
      `SIGNING_PROVIDER=${signingProvider} is not implemented (v0.1 local only; see docs/SIGNING_KEY_ROTATION_V0_1.md).`,
    );
  const key = process.env.STRIPE_SECRET_KEY;
  if (key && !/^(sk|rk)_test_/.test(key)) {
    if (!/^(sk|rk)_live_/.test(key))
      throw new Error('Only Stripe test or live credentials are accepted.');
    if (!config.liveCommerceEnabled && !config.identityLiveEnabled)
      throw new Error(
        'Stripe live credentials require LIVE_COMMERCE_ENABLED=true and/or IDENTITY_LIVE_ENABLED=true.',
      );
    if (config.identityLiveEnabled && config.identity !== 'stripe')
      throw new Error('IDENTITY_LIVE_ENABLED requires IDENTITY_PROVIDER=stripe.');
  }
}
