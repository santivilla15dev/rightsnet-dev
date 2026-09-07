'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from './session';
import { Button } from './ui/button';

export function ForgotPassword() {
  const { toast } = useSession(),
    [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ message?: string }>('auth/supabase/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setSent(true);
      toast(result.message ?? 'Revisa tu correo.');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <p className="login-brand">
          RightsNet<span>.</span>
        </p>
        <h1>Restablecer contraseña</h1>
        <p className="login-lead">
          Te enviaremos un enlace a tu correo si hay una cuenta asociada.
        </p>
        {sent ? (
          <p className="login-demo-note">
            Si el correo existe, recibirás instrucciones en unos minutos.{' '}
            <Link href="/login" className="login-help-link">
              Volver a iniciar sesión
            </Link>
          </p>
        ) : (
          <form className="login-form" onSubmit={(ev) => void submit(ev)}>
            <label>
              Correo
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />
            </label>
            <Button className="full-width" disabled={busy} type="submit">
              {busy ? 'Enviando…' : 'Enviar enlace'}
              <ArrowRight size={16} />
            </Button>
          </form>
        )}
        <p className="login-demo-note">
          <Link href="/login" className="login-help-link">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
