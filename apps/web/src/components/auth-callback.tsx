'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { redirectAfterAuth } from '@/lib/auth-redirect';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { useSession } from './session';
import { Loading, ErrorPanel } from './common';

export function AuthCallback() {
  const router = useRouter(),
    { refresh, toast } = useSession(),
    [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const supabase = getBrowserSupabase();
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const session = data.session;
        if (!session?.access_token || !session.refresh_token) {
          throw new Error('No se pudo completar el inicio de sesión social.');
        }
        await api('auth/supabase/session', {
          method: 'POST',
          body: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in ?? 3600,
          },
        });
        await refresh();
        if (!cancelled) await redirectAfterAuth(null, (href) => router.replace(href));
      } catch (err) {
        const message = (err as Error).message;
        if (!cancelled) {
          setError(message);
          toast(message);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refresh, router, toast]);

  if (error) {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <p className="login-brand">
            RightsNet<span>.</span>
          </p>
          <h1>No se pudo completar</h1>
          <ErrorPanel message={error} />
          <p className="login-demo-note">
            <Link href="/login" className="login-help-link">
              Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <Loading />
        <p className="login-lead">Completando el acceso…</p>
      </div>
    </div>
  );
}
