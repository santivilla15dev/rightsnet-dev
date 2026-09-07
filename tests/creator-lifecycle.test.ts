import { describe, expect, it } from 'vitest';
import {
  canAccessCreatorDashboard,
  canPurchaseLicense,
  creatorHomePath,
  getCreatorLifecycleState,
  getOnboardingProgress,
} from '../apps/web/src/lib/creator-lifecycle.ts';
import type { Asset } from '../apps/web/src/lib/types.ts';

const basePolicy = {
  schema_version: 'rightsnet.policy/0.1' as const,
  operations: ['synthetic_image'],
  categories: ['beauty'],
  territories: ['ES'],
  channels: ['instagram'],
  denied_categories: ['politics'],
  approval: 'automatic' as const,
  prices: { '30': 85000, '90': 150000 },
};

function asset(partial: Partial<Asset>): Asset {
  return {
    id: 'a1',
    creator_id: 'c1',
    display_name: 'Test',
    bio: 'bio',
    location: 'ES',
    portrait: '/x.svg',
    languages: ['es'],
    status: 'draft',
    identity_status: 'pending',
    relationship_status: 'pending',
    policy: basePolicy,
    policy_version: 1,
    policy_hash: 'abc',
    consented: false,
    files: [],
    ...partial,
  };
}

describe('creator lifecycle', () => {
  it('maps draft and incomplete states', () => {
    expect(getCreatorLifecycleState({ asset: null })).toBe('DRAFT');
    expect(creatorHomePath('DRAFT')).toBe('/onboarding');
    expect(canAccessCreatorDashboard('DRAFT')).toBe(false);
    const incomplete = asset({});
    expect(getCreatorLifecycleState({ asset: incomplete })).toBe('IDENTITY_PENDING');
    expect(getCreatorLifecycleState({ asset: asset({ identity_status: 'verified' }) })).toBe(
      'SETUP_INCOMPLETE',
    );
  });

  it('maps review and published', () => {
    expect(getCreatorLifecycleState({ asset: asset({ status: 'pending_review' }) })).toBe(
      'UNDER_REVIEW',
    );
    expect(creatorHomePath('UNDER_REVIEW')).toBe('/application');
    expect(
      getCreatorLifecycleState({
        asset: asset({ relationship_status: 'reviewed', status: 'draft' }),
      }),
    ).toBe('APPROVED');
    expect(canAccessCreatorDashboard('APPROVED')).toBe(true);
    expect(
      getCreatorLifecycleState({
        asset: asset({ status: 'published', relationship_status: 'reviewed' }),
      }),
    ).toBe('PUBLISHED');
  });

  it('tracks onboarding progress', () => {
    const ready = asset({
      identity_status: 'verified',
      consented: true,
      files: [{ id: 'f1', scan_status: 'pending' }],
    });
    const p = getOnboardingProgress({ asset: ready });
    expect(p.profile).toBe(true);
    expect(p.identity).toBe(true);
    expect(p.likeness).toBe(true);
    expect(p.licensingRules).toBe(true);
    expect(p.pricing).toBe(true);
    expect(p.consent).toBe(true);
    expect(p.review).toBe(true);
  });

  it('blocks creators from purchasing', () => {
    expect(canPurchaseLicense(null).ok).toBe(false);
    expect(canPurchaseLicense({ role: 'creator', organizations: [] }).reason).toBe('not_buyer');
    expect(
      canPurchaseLicense({
        role: 'buyer',
        organizations: [{ id: 'o1' }],
      }).ok,
    ).toBe(true);
  });
});
