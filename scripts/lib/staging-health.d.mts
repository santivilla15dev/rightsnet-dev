/**
 * Staging health smoke helpers. See docs/STAGING_HEALTH_SMOKE_V0_1.md
 */
/**
 * @typedef {{ status: string, environment?: string, commerce?: string }} HealthBody
 * @typedef {{ ok: boolean, id: string, detail: string }} Check
 */
/**
 * @param {number} statusCode
 * @param {unknown} body
 * @param {{ allowLiveCommerce?: boolean }} [opts]
 * @returns {Check[]}
 */
export function evaluateHealthPayload(statusCode: number, body: unknown, opts?: {
    allowLiveCommerce?: boolean;
}): Check[];
/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export function fetchJson(url: string, opts?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<{
    statusCode: number;
    body: unknown;
    url: string;
}>;
/**
 * @param {Check[]} checks
 */
export function allChecksOk(checks: Check[]): boolean;
export type HealthBody = {
    status: string;
    environment?: string;
    commerce?: string;
};
export type Check = {
    ok: boolean;
    id: string;
    detail: string;
};
