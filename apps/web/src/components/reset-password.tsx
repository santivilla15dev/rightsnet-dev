'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { useSession } from './session';
import { Button } from './ui/button';
import { ErrorPanel, Loading } from './common';

export function ResetPassword() {
  const router = useRouter(),
    { toast } = useSession(),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
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
        if (!data.session) throw new Error('El enlace de restablecimiento no es válido o expiró.');
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast('Contraseña actualizada. Ya puedes iniciar sesión.');
      router.push('/login');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <p className="login-brand">
            RightsNet<span>.</span>
          </p>
          <h1>Enlace no válido</h1>
          <ErrorPanel message={error} />
          <p className="login-demo-note">
            <Link href="/forgot-password" className="login-help-link">
              Solicitar un enlace nuevo
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <Loading />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <p className="login-brand">
          RightsNet<span>.</span>
        </p>
        <h1>Nueva contraseña</h1>
        <p className="login-lead">Elige una contraseña de al menos 8 caracteres.</p>
        <form className="login-form" onSubmit={(ev) => void submit(ev)}>
          <label>
            Contraseña
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </label>
          <Button className="full-width" disabled={busy} type="submit">
            {busy ? 'Guardando…' : 'Guardar contraseña'}
            <ArrowRight size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
