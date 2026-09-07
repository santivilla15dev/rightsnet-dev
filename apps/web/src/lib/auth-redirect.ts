import { creatorHomePath, getCreatorLifecycleState } from './creator-lifecycle';
import type { Asset, User } from './types';
import { api } from './api';

const SPACE_KEY = 'rightsnet_space';

export type AccountSpace = 'creator' | 'brand';

export function stashWelcomeIntent(intent: 'creator' | 'buyer') {
  try {
    sessionStorage.setItem('rightsnet_welcome_intent', intent);
  } catch {
    /* ignore */
  }
}

export function takeWelcomeIntent(): 'creator' | 'buyer' | undefined {
  try {
    const raw = sessionStorage.getItem('rightsnet_welcome_intent');
    sessionStorage.removeItem('rightsnet_welcome_intent');
    if (raw === 'creator' || raw === 'buyer') return raw;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function getPreferredSpace(): AccountSpace | null {
  try {
    const raw = sessionStorage.getItem(SPACE_KEY);
    if (raw === 'creator' || raw === 'brand') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function setPreferredSpace(space: AccountSpace) {
  try {
    sessionStorage.setItem(SPACE_KEY, space);
  } catch {
    /* ignore */
  }
}

export function accountCapabilities(user: Pick<User, 'role' | 'organizations' | 'has_creator'>) {
  const hasCreator = !!user.has_creator;
  const hasOrg = (user.organizations?.length ?? 0) > 0;
  return {
    hasCreator,
    hasOrg,
    isAdmin: user.role === 'admin',
    needsWelcome: !hasCreator && !hasOrg && user.role !== 'admin',
  };
}

export async function redirectAfterAuth(
  user: Pick<User, 'role' | 'organizations' | 'has_creator'> | { role?: string } | null | undefined,
  push: (href: string) => void,
) {
  const next = new URLSearchParams(window.location.search).get('next');
  if (next?.startsWith('/') && !next.startsWith('//')) {
    push(next);
    return;
  }

  const role = user && 'role' in user ? user.role : undefined;
  if (role === 'admin') {
    push('/ops');
    return;
  }

  // Prefer full me payload; if only role hint, load me.
  let me: User;
  if (user && 'organizations' in user && Array.isArray(user.organizations)) {
    me = user as User;
  } else {
    me = await api<User>('me');
  }

  const caps = accountCapabilities(me);
  if (caps.needsWelcome) {
    push('/welcome');
    return;
  }

  const preferred = getPreferredSpace();
  if (caps.hasCreator && caps.hasOrg) {
    if (preferred === 'creator') {
      await goCreatorHome(push);
      return;
    }
    push('/discover');
    return;
  }

  if (caps.hasCreator) {
    await goCreatorHome(push);
    return;
  }

  push('/discover');
}

async function goCreatorHome(push: (href: string) => void) {
  try {
    const profile = await api<{ assets: Asset[] }>('creator');
    const asset = profile.assets[0] ?? null;
    push(creatorHomePath(getCreatorLifecycleState({ asset })));
  } catch {
    push('/onboarding');
  }
}
