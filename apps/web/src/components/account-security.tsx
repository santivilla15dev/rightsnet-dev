'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, ErrorPanel, Loading, Title } from './common';

export function AccountSecurity() {
  const { user, loading, toast, refresh } = useSession();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [enroll, setEnroll] = useState<{
    factor_id: string;
    qr_code: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    void api<{ mfa_enabled?: boolean }>('config')
      .then((c) => setMfaEnabled(Boolean(c.mfa_enabled)))
      .catch(() => setMfaEnabled(false));
  }, []);

  async function startEnroll() {
    setBusy('enroll');
    setError('');
    try {
      const result = await api<{ factor_id: string; qr_code: string; secret: string }>(
        'auth/supabase/mfa/enroll',
        { method: 'POST', body: {} },
      );
      setEnroll(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy('confirm');
    setError('');
    try {
      await api('auth/supabase/mfa/enroll/confirm', {
        method: 'POST',
        body: { factor_id: enroll.factor_id, code },
      });
      await refresh();
      toast('MFA activado.');
      setEnroll(null);
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (loading) return <Loading />;
  if (!user) return <AuthRequired />;

  return (
    <>
      <Title
        eyebrow="CUENTA"
        title="Seguridad."
        description="Segundo factor (TOTP) con app autenticadora. Requiere MFA_ENABLED y Auth Supabase."
      />
      <p className="muted">
        <Link href="/">← Inicio</Link>
        {' · '}
        <Link href="/login">Login</Link>
      </p>

      {!mfaEnabled ? (
        <ErrorPanel message="MFA no está activo en este entorno (MFA_ENABLED=false)." />
      ) : (
        <section className="intent-form">
          <fieldset>
            <legend>Authenticator (TOTP)</legend>
            {!enroll ? (
              <Button type="button" disabled={!!busy} onClick={() => void startEnroll()}>
                {busy === 'enroll' ? 'Generando…' : 'Activar MFA'}
              </Button>
            ) : (
              <form onSubmit={(ev) => void confirmEnroll(ev)}>
                <p className="muted">Escanea el QR en tu app (Authy, 1Password, Google Authenticator).</p>
                <img
                  src={enroll.qr_code}
                  alt="QR MFA"
                  width={200}
                  height={200}
                  style={{ background: '#fff', padding: 8 }}
                />
                <p className="muted">
                  Secreto manual: <code>{enroll.secret}</code>
                </p>
                <label>
                  Código de 6 dígitos
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(ev) => setCode(ev.target.value.trim())}
                    required
                    minLength={6}
                    maxLength={12}
                  />
                </label>
                <Button type="submit" disabled={!!busy}>
                  {busy === 'confirm' ? 'Confirmando…' : 'Confirmar MFA'}
                </Button>
              </form>
            )}
          </fieldset>
        </section>
      )}

      {error ? <ErrorPanel message={error} /> : null}
    </>
  );
}
