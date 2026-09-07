import type { LegacyPolicy, RightsPolicy, AnyPolicy } from './types';

export function isRightsPolicy(policy: AnyPolicy): policy is RightsPolicy {
  return policy.schema_version === 'rightsnet.rights-policy/0.1';
}

export function isLegacyPolicy(policy: AnyPolicy): policy is LegacyPolicy {
  return policy.schema_version === 'rightsnet.policy/0.1';
}

export function policyApproval(policy: AnyPolicy): 'automatic' | 'manual' {
  if (isRightsPolicy(policy))
    return policy.approval_mode === 'MANUAL' ? 'manual' : 'automatic';
  return policy.approval;
}

export function allowedList(
  policy: AnyPolicy,
  kind: 'territories' | 'channels' | 'categories' | 'operations',
): string[] {
  if (isLegacyPolicy(policy)) {
    if (kind === 'categories') return policy.categories;
    if (kind === 'operations') return policy.operations;
    if (kind === 'territories') return policy.territories;
    return policy.channels;
  }
  if (kind === 'categories') {
    return Object.entries(policy.industries)
      .filter(([, v]) => v === 'ALLOW' || v === 'REQUIRES_APPROVAL')
      .map(([k]) => k);
  }
  if (kind === 'operations') {
    return Object.entries(policy.operations)
      .filter(([, v]) => v === 'ALLOW' || v === 'REQUIRES_APPROVAL')
      .map(([k]) => k);
  }
  if (kind === 'territories') {
    return Object.entries(policy.territories)
      .filter(([, v]) => v === 'ALLOW' || v === 'REQUIRES_APPROVAL')
      .map(([k]) => k);
  }
  return Object.entries(policy.channels)
    .filter(([, v]) => v === 'ALLOW' || v === 'REQUIRES_APPROVAL')
    .map(([k]) => k);
}

export function policyPrice(policy: AnyPolicy, days: 30 | 90): number | null {
  const key = String(days) as '30' | '90';
  if (isLegacyPolicy(policy)) return policy.prices[key];
  return policy.pricing.duration_prices_minor[key];
}

export function deniedSummary(policy: AnyPolicy): string {
  if (isLegacyPolicy(policy)) return policy.denied_categories.join(', ');
  return Object.entries(policy.industries)
    .filter(([, v]) => v === 'DENY')
    .map(([k]) => k)
    .join(', ');
}

export function allowedOperations(policy: AnyPolicy): string[] {
  if (isLegacyPolicy(policy)) return policy.operations;
  return Object.entries(policy.operations)
    .filter(([, v]) => v === 'ALLOW' || v === 'REQUIRES_APPROVAL')
    .map(([k]) => k);
}

export function allowsCommercialAds(policy: AnyPolicy): boolean {
  if (isLegacyPolicy(policy)) return true;
  const grant = policy.purpose.commercial_advertising;
  return grant === 'ALLOW' || grant === 'REQUIRES_APPROVAL';
}
