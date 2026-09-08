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
  port: Number(process.env.API_PORT ?? 4000),
};
export function assertConfiguration() {
  if (process.env.LIVE_COMMERCE_ENABLED === 'true')
    throw new Error('Live commerce is not enabled: launch gates are incomplete.');
  if (config.env === 'production')
    throw new Error('Production is blocked until launch gates are complete.');
  const key = process.env.STRIPE_SECRET_KEY;
  if (key && !/^(sk|rk)_test_/.test(key)) {
    if (!/^(sk|rk)_live_/.test(key))
      throw new Error('Only Stripe test or live credentials are accepted.');
    if (!config.identityLiveEnabled)
      throw new Error(
        'Stripe live credentials require IDENTITY_LIVE_ENABLED=true (Identity only; commerce still gated).',
      );
    if (config.identity !== 'stripe')
      throw new Error('Stripe live credentials require IDENTITY_PROVIDER=stripe.');
  }
}
