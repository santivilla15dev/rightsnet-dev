'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { redirectAfterAuth, stashWelcomeIntent } from '@/lib/auth-redirect';
import { useSession } from './session';
import { Button } from './ui/button';
import { OAuthButtons } from './oauth-buttons';

type AuthMode = 'sandbox' | 'supabase' | string;

export function Signup() {
  const { refresh, toast } = useSession(),
    router = useRouter(),
    search = useSearchParams(),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState<AuthMode | null>(null),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [displayName, setDisplayName] = useState(''),
    [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    void api<{ auth?: string }>('config')
      .then((cfg) => setAuthMode(cfg.auth ?? 'sandbox'))
      .catch(() => setAuthMode('sandbox'));
  }, []);

  useEffect(() => {
    const intent = search.get('intent');
    if (intent === 'creator' || intent === 'buyer') stashWelcomeIntent(intent);
  }, [search]);

  async function register(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCheckEmail(false);
    try {
      const intent = search.get('intent');
      if (intent === 'creator' || intent === 'buyer') stashWelcomeIntent(intent);
      const result = await api<{
        user: { role?: string } | null;
        status?: string;
        message?: string;
      }>('auth/supabase/signup', {
        method: 'POST',
        body: {
          email,
          password,
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
        },
      });
      if (result.status === 'check_email' || !result.user) {
        setCheckEmail(true);
        toast(result.message ?? 'Revisa tu correo para confirmar la cuenta.');
        return;
      }
      await refresh();
      await redirectAfterAuth(null, (href) => router.push(href));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (authMode === null) {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <p className="muted">Cargando…</p>
        </div>
      </div>
    );
  }

  if (authMode !== 'supabase') {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <p className="login-brand">
            RightsNet<span>.</span>
          </p>
          <h1>Crear cuenta</h1>
          <p className="login-lead">
            El registro requiere <code>AUTH_PROVIDER=supabase</code>. En CI usa la ruta técnica de
            demo.
          </p>
          <p className="login-demo-note">
            <Link href="/login" className="login-help-link">
              Iniciar sesión
            </Link>
            {' · '}
            <Link href="/" className="login-help-link">
              Inicio
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (checkEmail) {
    return (
      <div className="login-page">
        <div className="login-wrap">
          <p className="login-brand">
            RightsNet<span>.</span>
          </p>
          <h1>Revisa tu correo</h1>
          <p className="login-lead">
            Te enviamos un enlace de confirmación. Cuando confirmes, inicia sesión con el mismo
            correo y contraseña.
          </p>
          <Button asChild className="full-width">
            <Link href="/login">
              Ir a iniciar sesión
              <ArrowRight size={16} />
            </Link>
          </Button>
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
        <h1>Crea tu cuenta RightsNet</h1>
        <p className="login-lead">Después podrás elegir si empiezas como marca o como creador.</p>

        <OAuthButtons
          onError={(msg) => toast(msg)}
          onBeforeStart={() => {
            const intent = search.get('intent');
            if (intent === 'creator' || intent === 'buyer') stashWelcomeIntent(intent);
          }}
        />

        <form className="login-form" onSubmit={(ev) => void register(ev)}>
          <label>
            Nombre
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(ev) => setDisplayName(ev.target.value)}
              placeholder="Tu nombre"
            />
          </label>
          <label>
            Correo
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="tu@empresa.com"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </label>
          <Button className="full-width" disabled={busy} type="submit">
            {busy ? 'Creando cuenta…' : 'Crear cuenta'}
            <ArrowRight size={16} />
          </Button>
        </form>

        <p className="login-demo-note">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="login-help-link">
            Iniciar sesión
          </Link>
          {' · '}
          <Link href="/help" className="login-help-link">
            Guía
          </Link>
        </p>
      </div>
    </div>
  );
}
