/** @typedef {{ id: string, ok: boolean, detail: string }} Finding */
/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotEnv(text: string): Record<string, string>;
/**
 * @param {Record<string, string>} env
 * @param {{ config?: { auth?: string, demo_ui?: boolean, live_commerce?: boolean, environment?: string } | null }} [opts]
 * @returns {Finding[]}
 */
export function evaluateProductReady(env: Record<string, string>, opts?: {
    config?: {
        auth?: string;
        demo_ui?: boolean;
        live_commerce?: boolean;
        environment?: string;
    } | null;
}): Finding[];
/**
 * @param {string} root
 * @param {{ fetchConfig?: boolean, fetchImpl?: typeof fetch }} [opts]
 */
export function runProductReadyChecks(root: string, opts?: {
    fetchConfig?: boolean;
    fetchImpl?: typeof fetch;
}): Promise<Finding[]>;
/** @param {Finding[]} findings */
export function allOk(findings: Finding[]): boolean;
export type Finding = {
    id: string;
    ok: boolean;
    detail: string;
};
