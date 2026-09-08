import 'dotenv/config';
export const config = {
  env: process.env.APP_ENV ?? 'sandbox',
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  auth: process.env.AUTH_PROVIDER ?? 'sandbox',
  payments: process.env.PAYMENTS_PROVIDER ?? 'sandbox',
  /** sandbox = simulate; stripe = Stripe Identity Verification Sessions (test keys only). */
  identity: (process.env.IDENTITY_PROVIDER === 'stripe' ? 'stripe' : 'sandbox') as
    | 'sandbox'
    | 'stripe',
  /** When true, new creator policies must use rightsnet.rights-policy/0.1. Dual-path evaluation always keys off payload schema_version. */
  rightsCorePurchases: process.env.RIGHTS_CORE_PURCHASES === 'true',
  /**
   * RightsNet Connect (partner API under /v1/platform/*). Off by default.
   * Not Stripe Connect. Requires admin Bearer when enabled.
   */
  platformApiEnabled: process.env.PLATFORM_API_ENABLED === 'true',
  /**
   * Optional Higgsfield glue (authorize → stub/live HF → report). Off by default.
   * Live HF calls require a separate decision + keys; default mode is sandbox stub.
   */
  higgsfieldAdapterEnabled: process.env.HIGGSFIELD_ADAPTER_ENABLED === 'true',
  higgsfieldMode: (process.env.HIGGSFIELD_MODE === 'live' ? 'live' : 'sandbox') as
    | 'sandbox'
    | 'live',
  port: Number(process.env.API_PORT ?? 4000),
};
export function assertConfiguration() {
  if (process.env.LIVE_COMMERCE_ENABLED === 'true')
    throw new Error('Live commerce is not enabled: launch gates are incomplete.');
  if (config.env === 'production')
    throw new Error('Production is blocked until launch gates are complete.');
  if (process.env.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY))
    throw new Error('Only Stripe test credentials are accepted.');
}
