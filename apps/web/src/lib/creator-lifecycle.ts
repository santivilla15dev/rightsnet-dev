import type { Asset } from './types';

/** Conceptual creator lifecycle — derived from existing fields (no DB enum). */
export type CreatorLifecycleState =
  | 'DRAFT'
  | 'IDENTITY_PENDING'
  | 'SETUP_INCOMPLETE'
  | 'READY_FOR_REVIEW'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUIRED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'SUSPENDED';

export type LifecycleInput = {
  asset: Pick<
    Asset,
    | 'status'
    | 'identity_status'
    | 'relationship_status'
    | 'consented'
    | 'files'
    | 'policy'
    | 'display_name'
  > | null;
  adult_verified?: boolean;
  connected_account?: string | null;
};

function hasLikeness(asset: NonNullable<LifecycleInput['asset']>) {
  return (asset.files?.length ?? 0) > 0;
}

function hasPricing(asset: NonNullable<LifecycleInput['asset']>) {
  const p = asset.policy as {
    prices?: { '30'?: number };
    pricing?: { duration_prices_minor?: { '30'?: number | null } };
  };
  if (p.prices?.['30'] != null && p.prices['30'] > 0) return true;
  const minor = p.pricing?.duration_prices_minor?.['30'];
  return minor != null && minor > 0;
}

function hasLicensingRules(asset: NonNullable<LifecycleInput['asset']>) {
  const p = asset.policy as Record<string, unknown>;
  if (!p) return false;
  if (p.schema_version === 'rightsnet.rights-policy/0.1') {
    const industries = (p.industries ?? {}) as Record<string, string>;
    return Object.keys(industries).length > 0;
  }
  const cats = p.categories as string[] | undefined;
  return Array.isArray(cats) && cats.length > 0;
}

/** Completion flags for the 7-step onboarding UI. */
export function getOnboardingProgress(input: LifecycleInput) {
  const a = input.asset;
  if (!a) {
    return {
      profile: false,
      identity: false,
      likeness: false,
      licensingRules: false,
      pricing: false,
      consent: false,
      review: false,
      completedCount: 0,
      total: 7,
    };
  }
  const profile = !!(a.display_name && a.display_name.length >= 2);
  const identity = a.identity_status === 'verified';
  const likeness = hasLikeness(a);
  const licensingRules = hasLicensingRules(a);
  const pricing = hasPricing(a);
  const consent = !!a.consented;
  const review =
    profile && identity && likeness && licensingRules && pricing && consent;
  const flags = [profile, identity, likeness, licensingRules, pricing, consent, review];
  return {
    profile,
    identity,
    likeness,
    licensingRules,
    pricing,
    consent,
    review,
    completedCount: flags.filter(Boolean).length,
    total: 7,
  };
}

export function getCreatorLifecycleState(input: LifecycleInput): CreatorLifecycleState {
  const a = input.asset;
  if (!a) return 'DRAFT';
  if (a.status === 'suspended') return 'SUSPENDED';
  if (a.status === 'published') return 'PUBLISHED';
  if (a.relationship_status === 'rejected' || a.status === 'rejected') return 'CHANGES_REQUIRED';
  if (a.status === 'pending_review') return 'UNDER_REVIEW';
  if (a.relationship_status === 'reviewed') return 'APPROVED';

  const progress = getOnboardingProgress(input);
  if (progress.review) return 'READY_FOR_REVIEW';
  if (a.identity_status !== 'verified') {
    return progress.profile ? 'IDENTITY_PENDING' : 'DRAFT';
  }
  return 'SETUP_INCOMPLETE';
}

export function canPurchaseLicense(user: {
  role: string;
  organizations: { id: string }[];
} | null) {
  if (!user) return { ok: false as const, reason: 'unauthenticated' as const };
  if (user.role === 'admin')
    return { ok: false as const, reason: 'not_buyer' as const };
  if (!user.organizations.length)
    return { ok: false as const, reason: 'no_organization' as const };
  return { ok: true as const };
}

export function canAccessCreatorDashboard(state: CreatorLifecycleState) {
  return state === 'PUBLISHED' || state === 'SUSPENDED';
}

export function creatorHomePath(state: CreatorLifecycleState) {
  switch (state) {
    case 'DRAFT':
    case 'IDENTITY_PENDING':
    case 'SETUP_INCOMPLETE':
      return '/onboarding';
    case 'READY_FOR_REVIEW':
      return '/onboarding?step=review';
    case 'UNDER_REVIEW':
    case 'CHANGES_REQUIRED':
      return '/application';
    case 'APPROVED':
      return '/application';
    case 'PUBLISHED':
    case 'SUSPENDED':
      return '/dashboard';
    default:
      return '/onboarding';
  }
}
