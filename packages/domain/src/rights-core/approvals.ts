import type { ApprovalAction } from './schemas.js';

export type ApprovalValidity =
  | { valid: true }
  | {
      valid: false;
      reason:
        | 'mismatch'
        | 'expired'
        | 'rejected'
        | 'missing'
        | 'wrong_role';
    };

export function validateApprovalBinding(input: {
  approval: ApprovalAction | null | undefined;
  expected: {
    request_id: string;
    buyer_organization_id: string;
    asset_id: string;
    request_hash: string;
    policy_hash: string;
    platform_policy_version: string;
  };
  now: string;
  requiredRole: 'creator' | 'platform_reviewer';
}): ApprovalValidity {
  const { approval, expected, now, requiredRole } = input;
  if (!approval) return { valid: false, reason: 'missing' };
  if (approval.actor_role !== requiredRole) return { valid: false, reason: 'wrong_role' };
  if (approval.decision === 'REJECTED') return { valid: false, reason: 'rejected' };
  if (
    approval.request_id !== expected.request_id ||
    approval.buyer_organization_id !== expected.buyer_organization_id ||
    approval.asset_id !== expected.asset_id ||
    approval.request_hash !== expected.request_hash ||
    approval.policy_hash !== expected.policy_hash ||
    approval.platform_policy_version !== expected.platform_policy_version
  ) {
    return { valid: false, reason: 'mismatch' };
  }
  // Expiry at the evaluation instant is expired (exclusive upper bound).
  if (Date.parse(approval.expires_at) <= Date.parse(now)) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true };
}
