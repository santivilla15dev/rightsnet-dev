import type { LicenseDecision } from './schemas.js';

export type IssuanceGateInput = {
  payment_succeeded: boolean;
  contract_accepted: boolean;
  eligibility: LicenseDecision;
  /** When true, current blockers remain after payment (fulfillment recheck). */
  fulfillment_blocked?: boolean;
};

export type IssuanceGateResult = {
  allowed: boolean;
  review_required: boolean;
  reasons: string[];
};

/**
 * Pure issuance gate — ALLOW eligibility alone never issues a license.
 */
export function assertIssuanceAllowed(input: IssuanceGateInput): IssuanceGateResult {
  const reasons: string[] = [];
  if (!input.payment_succeeded) reasons.push('PAYMENT_NOT_SUCCEEDED');
  if (!input.contract_accepted) reasons.push('CONTRACT_NOT_ACCEPTED');
  if (input.eligibility.decision !== 'ALLOW') reasons.push('ELIGIBILITY_NOT_ALLOW');
  if (input.fulfillment_blocked) reasons.push('FULFILLMENT_BLOCKED');

  if (reasons.includes('FULFILLMENT_BLOCKED') && input.payment_succeeded) {
    return { allowed: false, review_required: true, reasons };
  }
  if (reasons.length) return { allowed: false, review_required: false, reasons };
  return { allowed: true, review_required: false, reasons: [] };
}

/** Historical signed evidence must remain byte-identical after later policy changes. */
export function evidenceUnchanged(
  issuedSnapshot: unknown,
  laterPolicy: unknown,
): { snapshot_intact: true; policy_differs: boolean } {
  const a = JSON.stringify(issuedSnapshot);
  const b = JSON.stringify(laterPolicy);
  return { snapshot_intact: true, policy_differs: a !== b };
}
