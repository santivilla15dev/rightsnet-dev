'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { accountCapabilities } from '@/lib/auth-redirect';
import type { User } from '@/lib/types';
import { useSession } from './session';
import { Button } from './ui/button';
import { AuthRequired, ErrorPanel, Loading } from './common';

type MemberRole = 'owner' | 'employee' | 'agency';
type Country = 'AT' | 'DE' | 'ES';

export function CompanySetup() {
  const { user, loading, refresh, toast } = useSession(),
    router = useRouter(),
    search = useSearchParams(),
    [legalName, setLegalName] = useState(''),
    [website, setWebsite] = useState(''),
    [country, setCountry] = useState<Country>('AT'),
    [memberRole, setMemberRole] = useState<MemberRole>('owner'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');

  const nextPath = search.get('next');

  useEffect(() => {
    if (loading || !user) return;
    const caps = accountCapabilities(user as User);
    if (caps.isAdmin) {
      router.replace('/ops');
      return;
    }
    if (caps.hasOrg) {
      router.replace(nextPath && nextPath.startsWith('/') ? nextPath : '/company/ready');
    }
  }, [loading, user, router, nextPath]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('organizations/setup', {
        method: 'POST',
        body: {
          legal_name: legalName.trim(),
          website: website.trim() || undefined,
          country,
          member_role: memberRole,
        },
      });
      await refresh();
      toast('Empresa creada.');
      router.push(nextPath && nextPath.startsWith('/') ? nextPath : '/company/ready');
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!user) return <AuthRequired />;

  return (
    <div className="login-page">
      <div className="login-wrap welcome-wrap">
        <p className="login-brand">
          RightsNet<span>.</span>
        </p>
        <h1>Crea tu empresa</h1>
        <p className="login-lead">
          La organización compra las licencias. Tú actúas en su nombre. Sin verificación
          empresarial en este paso.
        </p>
        {error ? <ErrorPanel message={error} /> : null}

        <form className="login-form" onSubmit={(ev) => void onSubmit(ev)}>
          <label>
            Nombre de la empresa
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={legalName}
              onChange={(ev) => setLegalName(ev.target.value)}
              placeholder="Ej. Aurora Brands GmbH"
              autoComplete="organization"
            />
          </label>
          <label>
            Sitio web
            <input
              type="text"
              value={website}
              onChange={(ev) => setWebsite(ev.target.value)}
              placeholder="https://ejemplo.com (opcional)"
              autoComplete="url"
            />
          </label>
          <label>
            País
            <select
              value={country}
              onChange={(ev) => setCountry(ev.target.value as Country)}
              aria-label="País de la empresa"
            >
              <option value="AT">Austria (AT)</option>
              <option value="DE">Alemania (DE)</option>
              <option value="ES">España (ES)</option>
            </select>
          </label>
          <fieldset className="signup-role-grid" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Tu rol</legend>
            <p className="login-demo-note" style={{ textAlign: 'left', marginBottom: 8 }}>
              Tu rol en la empresa
            </p>
            {(
              [
                ['owner', 'Propietario', 'Dueño o fundador'],
                ['employee', 'Empleado', 'Compras en nombre de la empresa'],
                ['agency', 'Agencia', 'Agencia que licencia para clientes'],
              ] as const
            ).map(([value, title, hint]) => (
              <button
                key={value}
                type="button"
                className={
                  'signup-role' + (memberRole === value ? ' signup-role-active' : '')
                }
                onClick={() => setMemberRole(value)}
              >
                <strong>{title}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </fieldset>
          <Button className="full-width" type="submit" disabled={busy || legalName.trim().length < 2}>
            {busy ? 'Creando…' : 'Continuar'}
            <ArrowRight size={16} />
          </Button>
        </form>

        <p className="login-demo-note">
          El país es el domicilio de la empresa, no el territorio de la licencia de campaña.
        </p>
        <p className="login-demo-note">
          <Link href="/welcome" className="login-help-link">
            Volver
          </Link>
        </p>
      </div>
    </div>
  );
}
