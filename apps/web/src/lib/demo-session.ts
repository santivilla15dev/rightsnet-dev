/** Client-side demo session marker (sandbox persona via /demo). Not used for real Supabase auth. */

export type DemoSession = {
  scenario: string;
  personaName: string;
  orgName?: string;
  role: string;
};

const KEY = 'rightsnet_demo_session';

export function setDemoSession(session: DemoSession) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function getDemoSession(): DemoSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

export function clearDemoSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}

export function isDemoModeActive() {
  return getDemoSession() !== null;
}
