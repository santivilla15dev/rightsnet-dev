'use client';

import { Button } from './ui/button';
import { getBrowserSupabase, oauthCallbackUrl } from '@/lib/supabase-browser';

type Provider = 'google' | 'apple';

export function OAuthButtons({
  onError,
  onBeforeStart,
}: {
  onError: (message: string) => void;
  onBeforeStart?: () => void;
}) {
  async function start(provider: Provider) {
    try {
      onBeforeStart?.();
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: oauthCallbackUrl() },
      });
      if (error) onError(error.message);
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <div className="oauth-stack">
      <Button
        type="button"
        variant="outline"
        className="full-width"
        onClick={() => void start('google')}
      >
        Continuar con Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className="full-width"
        onClick={() => void start('apple')}
      >
        Continuar con Apple
      </Button>
      <p className="oauth-divider" role="separator">
        <span>o</span>
      </p>
    </div>
  );
}
