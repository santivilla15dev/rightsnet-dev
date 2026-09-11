/** @typedef {{ id: string, ok: boolean, detail: string }} Finding */
/**
 * @param {string} root
 * @returns {Finding[]}
 */
export function runStagingSecurityChecks(root: string): Finding[];
/**
 * @param {string} root
 * @returns {string[]}
 */
export function scanTrackedForLiveStripeKeys(root: string): string[];
/**
 * @param {Finding[]} findings
 */
export function allOk(findings: Finding[]): boolean;
/** Checklist humana (founder) — no automatizable sin cloud. */
export const HUMAN_STAGING_CHECKLIST: string[];
export type Finding = {
    id: string;
    ok: boolean;
    detail: string;
};
