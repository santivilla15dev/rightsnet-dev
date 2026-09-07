import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

export function oauthCallbackUrl() {
  if (typeof window !== 'undefined') return `${window.location.origin}/auth/callback`;
  const web = process.env.WEB_URL ?? 'http://localhost:3000';
  return `${web.replace(/\/$/, '')}/auth/callback`;
}

export function resetPasswordRedirectUrl() {
  if (typeof window !== 'undefined') return `${window.location.origin}/reset-password`;
  const web = process.env.WEB_URL ?? 'http://localhost:3000';
  return `${web.replace(/\/$/, '')}/reset-password`;
}
