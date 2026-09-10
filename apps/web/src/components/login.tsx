'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { redirectAfterAuth } from '@/lib/auth-redirect';
import { useSession } from './session';
import { Button } from './ui/button';
import { OAuthButtons } from './oauth-buttons';

type AuthMode = 'sandbox' | 'supabase' | string;

type MfaPending = {
  factor_id: string;
  mfa_access_token: string;
  mfa_refresh_token: string;
};

export function Login() {
  const { refresh, user, toast } = useSession(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState<AuthMode | null>(null),
    [demoUi, setDemoUi] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [mfaCode, setMfaCode] = useState(''),
    [mfaPending, setMfaPending] = useState<MfaPending | null>(null),
    [resolvingContinue, setResolvingContinue] = useState(false);

  useEffect(() => {
    void api<{ auth?: string; demo_ui?: boolean }>('config')
      .then((cfg) => {
        setAuthMode(cfg.auth ?? 'sandbox');
        setDemoUi(!!cfg.demo_ui);
      })
      .catch(() => {
        setAuthMode('sandbox');
        setDemoUi(false);
      });
  }, []);

  async function continueSession() {
    setResolvingContinue(true);
    try {
      await redirectAfterAuth(user, (href) => router.push(href));
    } finally {
      setResolvingContinue(false);
    }
  }

  async function emailLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api<{
        status?: string;
        factor_id?: string;
        mfa_access_token?: string;
        mfa_refresh_token?: string;
        user?: unknown;
      }>('auth/supabase/login', {
        method: 'POST',
        body: { email, password },
      });
      if (
        result.status === 'mfa_required' &&
        result.factor_id &&
        result.mfa_access_token &&
        result.mfa_refresh_token
      ) {
        setMfaPending({
          factor_id: result.factor_id,
          mfa_access_token: result.mfa_access_token,
          mfa_refresh_token: result.mfa_refresh_token,
        });
        toast('Introduce el código de tu app autenticadora.');
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

  async function verifyMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfaPending) return;
    setBusy(true);
    try {
      await api('auth/supabase/mfa/verify', {
        method: 'POST',
        body: {
          access_token: mfaPending.mfa_access_token,
          refresh_token: mfaPending.mfa_refresh_token,
          factor_id: mfaPending.factor_id,
          code: mfaCode,
        },
      });
      setMfaPending(null);
      setMfaCode('');
      await refresh();
      await redirectAfterAuth(null, (href) => router.push(href));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('auth/logout', { method: 'POST', body: {} });
    await refresh();
    toast('Sesión cerrada.');
    router.push('/');
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

  const sessionBlock = user ? (
    <section className="login-session" aria-label="Sesión activa">
      <p className="login-session-label">Sesión activa</p>
      <p className="login-session-name">{user.display_name}</p>
      <p className="login-session-role">{user.role}</p>
      <div className="login-session-actions">
        <Button disabled={resolvingContinue} onClick={() => void continueSession()}>
          {resolvingContinue ? 'Continuando…' : 'Continuar'}
          <ArrowRight size={16} />
        </Button>
        <Button variant="outline" onClick={() => void logout()}>
          Cerrar sesión
        </Button>
      </div>
    </section>
  ) : null;

  return (
    <div className="login-page">
      <div className="login-wrap">
        <p className="login-brand">
          RightsNet<span>.</span>
        </p>
        <h1>{mfaPending ? 'Verificación MFA' : 'Bienvenido de nuevo'}</h1>
        <p className="login-lead">
          {mfaPending
            ? 'Abre tu app autenticadora e introduce el código de 6 dígitos.'
            : 'Accede con tu cuenta de RightsNet.'}
        </p>
        {sessionBlock}
        {authMode === 'supabase' ? (
          mfaPending ? (
            <form className="login-form" onSubmit={(ev) => void verifyMfa(ev)}>
              <label>
                Código MFA
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={12}
                  value={mfaCode}
                  onChange={(ev) => setMfaCode(ev.target.value.trim())}
                  placeholder="123456"
                />
              </label>
              <Button className="full-width" disabled={busy} type="submit">
                {busy ? 'Verificando…' : 'Verificar y entrar'}
                <ArrowRight size={16} />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="full-width"
                disabled={busy}
                onClick={() => {
                  setMfaPending(null);
                  setMfaCode('');
                }}
              >
                Volver
              </Button>
            </form>
          ) : (
            <>
              <OAuthButtons onError={(msg) => toast(msg)} />
              <form className="login-form" onSubmit={(ev) => void emailLogin(ev)}>
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
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                  />
                </label>
                <Button className="full-width" disabled={busy} type="submit">
                  {busy ? 'Entrando…' : 'Iniciar sesión'}
                  <ArrowRight size={16} />
                </Button>
              </form>
              <p className="login-demo-note">
                <Link href="/forgot-password" className="login-help-link">
                  ¿Olvidaste tu contraseña?
                </Link>
                {' · '}
                <Link href="/account/security" className="login-help-link">
                  Seguridad / MFA
                </Link>
              </p>
            </>
          )
        ) : (
          <section className="login-sandbox-notice panel" style={{ padding: '1.25rem' }}>
            <p>
              El acceso con correo y OAuth requiere <code>AUTH_PROVIDER=supabase</code> (uso de
              producto). Ver <code>docs/runbooks/auth-supabase.md</code>.
            </p>
            {demoUi ? (
              <Button asChild className="full-width" style={{ marginTop: '1rem' }}>
                <Link href="/demo">
                  Ir a Demo
                  <ArrowRight size={16} />
                </Link>
              </Button>
            ) : (
              <p className="login-demo-note" style={{ marginTop: '1rem' }}>
                El selector de personas (<code>/demo</code>) está desactivado (
                <code>DEMO_UI_ENABLED=false</code>). Solo para CI/E2E internos.
              </p>
            )}
          </section>
        )}
        <p className="login-demo-note">
          ¿Nuevo en RightsNet?{' '}
          <Link href="/signup" className="login-help-link">
            Crear cuenta
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
