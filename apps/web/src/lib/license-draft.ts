/** Persist configure-license intent across login / company setup. */
const KEY = 'rightsnet_license_draft';

export type LicenseDraft = {
  assetPath: string;
  assetId: string;
  campaign: string;
  operation: string;
  category: string;
  territories: string[];
  channels: string[];
  duration: 30 | 90;
  start: string;
  rights: boolean;
  action?: 'continue' | 'request_approval';
};

export function stashLicenseDraft(draft: LicenseDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function takeLicenseDraft(): LicenseDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as LicenseDraft;
  } catch {
    return null;
  }
}

export function peekLicenseDraft(): LicenseDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LicenseDraft;
  } catch {
    return null;
  }
}
